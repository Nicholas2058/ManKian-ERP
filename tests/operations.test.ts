import { describe, expect, it } from 'vitest';
import { factorOf, toBase, fromBase, breakdown } from '@/domain/uom';
import { productStock } from '@/domain/inventory';
import * as S from '@/domain/commands/sales';
import * as F from '@/domain/commands/fulfilment';
import * as P from '@/domain/commands/procurement';
import { adjustStock } from '@/domain/commands/inventory';
import { DomainError } from '@/domain/state';
import { ANCHOR, ctx, exec, pid, seed } from './helpers';
import { addDays } from '@/lib/dates';

describe('unit conversions are product-specific', () => {
  const db = seed();
  it('uses each product’s own pack size', () => {
    const e50 = db.products[pid('PVE-050')];
    const e15 = db.products[pid('PVE-015')];
    expect(factorOf(e50, 'BOX')).toBe(25);
    expect(factorOf(e15, 'BOX')).toBe(100);
    expect(toBase(e50, 2, 'BOX')).toBe(50);
    expect(fromBase(e15, 250, 'BOX')).toBe(2.5);
    expect(breakdown(e50, 60)).toBe('2 BOX + 10 PCS');
  });
  it('never guesses a conversion that is not defined', () => {
    expect(() => factorOf(db.products[pid('ANG-5050')], 'BOX')).toThrow(DomainError);
  });
  it('supports fractional metre / litre quantities', () => {
    const g = db.products[pid('GTX-150')];
    expect(toBase(g, 1.5, 'ROLL')).toBe(150);
    expect(toBase(db.products[pid('CHM-MRO')], 2, 'DRUM')).toBe(400);
  });
});

describe('stock definitions', () => {
  it('available = on hand − blocked − reserved, and incoming is never available', () => {
    const db = seed();
    for (const p of Object.values(db.products)) {
      const s = productStock(db, p.id);
      expect(s.available).toBe(Math.max(0, Math.round((s.onHand - s.blocked - s.reserved) * 10000) / 10000));
    }
    const ub = productStock(db, pid('UBL-M12-4'));
    expect(ub.available).toBe(0);
  });
  it('blocks adjustments that would leave reservations unbacked', () => {
    let db = seed();
    const id = pid('SHM-YLW');
    const s = productStock(db, id);
    const bin = Object.values(db.binStock).find((b) => b.productId === id && db.bins[b.binId].kind === 'rack')!;
    expect(() => exec(db, adjustStock, { productId: id, binId: bin.binId, delta: -(s.available + 1), reason: 'Lost / missing' }, ctx('wh_supervisor'))).toThrow(DomainError);
    ({ db } = exec(db, adjustStock, { productId: id, binId: bin.binId, delta: 5, reason: 'Found stock' }, ctx('wh_supervisor')));
    expect(productStock(db, id).onHand).toBe(s.onHand + 5);
  });
});

describe('quote → order → partial reservation → backorder → GRN → fulfilment', () => {
  it('runs scenario B end to end with immutable snapshots and partial shipments', () => {
    let db = seed();
    const sc = db.config.scenario;
    let r: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const C = (role: Parameters<typeof ctx>[0], mins = 0) => ctx(role, new Date(Date.parse(ANCHOR) + mins * 60_000).toISOString());
    // enquiry → RFQ → quote
    ({ db } = exec(db, S.qualifyEnquiry, { enquiryId: sc.enquiryB, customerId: 'c13' }, C('sales_exec', 1)));
    ({ db, r } = exec(db, S.convertEnquiryToRfq, { enquiryId: sc.enquiryB }, C('sales_exec', 2)));
    expect(r.lines).toHaveLength(2);
    ({ db, r } = exec(db, S.createQuoteFromRfq, { rfqId: r.id }, C('sales_exec', 3)));
    const qid = r.id;
    ({ db } = exec(db, S.updateQuoteHeader, { quoteId: qid, patch: { freight: 8000, validityDays: 3 } }, C('sales_exec', 4)));
    ({ db, r } = exec(db, S.submitQuote, { quoteId: qid }, C('sales_exec', 5)));
    if (r.status === 'pending_approval') ({ db } = exec(db, S.decideQuote, { quoteId: qid, approve: true }, C('sales_manager', 6)));
    // issuing locks a snapshot
    ({ db } = exec(db, S.issueQuote, { quoteId: qid }, C('sales_exec', 7)));
    const snap = JSON.stringify(db.quotes[qid].versions[0]);
    expect(db.quotes[qid].versions[0].frozen).toBe(true);
    expect(() => exec(db, S.addQuoteLine, { quoteId: qid, productId: pid('PVT-050'), qty: 1, uom: 'PCS' }, C('sales_exec', 8))).toThrow(/locked/);
    // accept & convert
    ({ db } = exec(db, S.markQuoteAccepted, { quoteId: qid }, C('sales_exec', 9)));
    ({ db, r } = exec(db, S.convertQuoteToOrder, { quoteId: qid }, C('sales_exec', 10)));
    const oid = r.id;
    expect(db.salesOrders[oid].lines.map((l) => l.unitPrice)).toEqual(db.quotes[qid].versions[0].lines.map((l) => l.unitPrice));
    expect(JSON.stringify(db.quotes[qid].versions[0])).toBe(snap);
    // quoting did not reserve anything
    expect(productStock(db, pid('PVE-050')).available).toBe(25);
    ({ db, r } = exec(db, S.reserveOrder, { orderId: oid }, C('sales_exec', 11)));
    const elbow = db.salesOrders[oid].lines.find((l) => l.productId === pid('PVE-050'))!;
    expect(elbow.allocated).toBe(25);
    expect(elbow.backorderQty).toBe(15);
    expect(productStock(db, pid('PVE-050')).available).toBe(0);
    expect(Object.values(db.backorders).find((b) => b.lineId === elbow.id)?.qty).toBe(15);
    // repeated reserve is a no-op (no double allocation)
    ({ db } = exec(db, S.reserveOrder, { orderId: oid }, C('sales_exec', 12)));
    expect(db.salesOrders[oid].lines.find((l) => l.id === elbow.id)!.allocated).toBe(25);

    // pick + deliver what is available (partial shipment)
    ({ db, r } = exec(db, F.createPicklist, { orderId: oid }, C('wh_supervisor', 20)));
    const plId = r.id;
    ({ db, r } = exec(db, F.createPicklist, { orderId: oid }, C('wh_supervisor', 21)));
    expect(r.id).toBe(plId); // idempotent
    ({ db } = exec(db, F.pickAll, { picklistId: plId }, C('wh_supervisor', 22)));
    const onHandBefore = productStock(db, pid('PVE-050')).onHand;
    ({ db, r } = exec(db, F.createDelivery, { orderId: oid, type: 'delivery' }, C('wh_supervisor', 30)));
    const doId = r.id;
    ({ db } = exec(db, F.scheduleDelivery, { doId, vehicleId: 'v2', driverId: 'd2', date: addDays(ANCHOR, 0) }, C('dispatcher', 31)));
    ({ db } = exec(db, F.dispatchDelivery, { doId }, C('dispatcher', 32)));
    ({ db } = exec(db, F.dispatchDelivery, { doId }, C('dispatcher', 33))); // repeated click
    expect(productStock(db, pid('PVE-050')).onHand).toBe(onHandBefore - 25);
    ({ db } = exec(db, F.confirmDelivery, { doId, signedName: 'Rizal Hakim' }, C('dispatcher', 60)));
    const o1 = db.salesOrders[oid];
    expect(o1.status).toBe('partially_dispatched');
    expect(Object.values(db.invoices).filter((i) => i.orderId === oid)).toHaveLength(1);

    // procurement: PO for elbows, partial GRN allocates the backorder
    ({ db, r } = exec(db, P.createPurchaseOrder, { supplierId: 's10', lines: [{ productId: pid('PVE-050'), qty: 100, unitCost: db.products[pid('PVE-050')].cost }] }, C('procurement', 70)));
    const poId = r.id;
    ({ db } = exec(db, P.sendPO, { poId }, C('procurement', 71)));
    const line = db.purchaseOrders[poId].lines[0];
    expect(productStock(db, pid('PVE-050')).incoming).toBe(100);
    expect(productStock(db, pid('PVE-050')).available).toBe(0); // incoming is not available
    const bin = Object.values(db.binStock).find((b) => b.productId === pid('PVE-050'))?.binId ?? 'bin_C01_1_1';
    ({ db, r } = exec(db, P.receiveGoods, { poId, lines: [{ poLineId: line.id, qty: 40, damaged: 2, binId: bin }], allocateBackorders: true }, C('wh_supervisor', 80)));
    expect(db.purchaseOrders[poId].status).toBe('partial');
    expect(r.allocations).toHaveLength(1);
    const st = productStock(db, pid('PVE-050'));
    expect(st.blocked).toBe(2);
    expect(st.incoming).toBe(58);
    expect(Object.values(db.backorders).find((b) => b.lineId === elbow.id)?.status).toBe('allocated');
    expect(() => exec(db, P.receiveGoods, { poId, lines: [{ poLineId: line.id, qty: 100, binId: bin }] }, C('wh_supervisor', 81))).toThrow(/exceeds outstanding/);
  });

  it('cancelling an order releases reservations and backorders', () => {
    let db = seed();
    const oid = db.config.scenario.orderD1;
    const before = productStock(db, pid('SHM-YLW')).available;
    ({ db } = exec(db, S.cancelOrder, { orderId: oid, reason: 'test' }, ctx('sales_manager')));
    expect(db.salesOrders[oid].status).toBe('cancelled');
    expect(productStock(db, pid('SHM-YLW')).available).toBe(before + 40);
  });

  it('reversing a pick restores the bin and order quantities exactly', () => {
    let db = seed();
    const oid = db.config.scenario.orderD2;
    let r: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    ({ db, r } = exec(db, F.createPicklist, { orderId: oid }, ctx('wh_supervisor')));
    const t = r.tasks[0];
    const binQty = () => Object.values(db.binStock).filter((b) => b.productId === t.productId && b.binId === t.binId).reduce((s, b) => s + b.qty, 0);
    const q0 = binQty();
    const onHand0 = productStock(db, t.productId).onHand;
    ({ db } = exec(db, F.pickTask, { picklistId: r.id, taskId: t.id, qty: t.qty }, ctx('wh_supervisor')));
    expect(binQty()).toBe(q0 - t.qty);
    expect(productStock(db, t.productId).onHand).toBe(onHand0); // picking moves stock, it does not consume it
    ({ db } = exec(db, F.unpickTask, { picklistId: r.id, taskId: t.id, qty: t.qty, reason: 'test' }, ctx('wh_supervisor')));
    expect(binQty()).toBe(q0);
    expect(db.salesOrders[oid].lines.every((l) => l.picked === 0)).toBe(true);
  });

  it('expires issued quotes after validity and blocks acceptance', () => {
    let db = seed();
    const q = Object.values(db.quotes).find((x) => x.status === 'issued')!;
    const later = addDays(q.versions[q.currentVersion - 1].expiresAt!, 1);
    ({ db } = exec(db, S.expireQuotes, undefined as never, ctx('owner', later)));
    expect(db.quotes[q.id].status).toBe('expired');
    let r: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    ({ db, r } = exec(db, S.reviseQuote, { quoteId: q.id, reason: 'reissue' }, ctx('sales_exec', later)));
    expect(r.version).toBe(q.currentVersion + 1);
    expect(db.quotes[q.id].versions[q.currentVersion - 1].frozen).toBe(true); // history preserved
    ({ db, r } = exec(db, S.submitQuote, { quoteId: q.id }, ctx('sales_exec', later)));
    expect(r.status).toBe('pending_approval'); // re-issue after expiry needs approval
  });
});
