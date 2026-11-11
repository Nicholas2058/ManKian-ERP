/**
 * Real PDF generation in the browser (jsPDF + autotable), loaded on demand.
 * Every document carries a DEMO SAMPLE watermark and a non-binding disclaimer.
 */
import type { DbState } from '@/domain/state';
import type { DeliveryOrder, Invoice, PurchaseOrder, Quote } from '@/domain/types';
import { COMPANY } from '@/data/reference';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { formatRM, lineTotal } from '@/lib/money';
import { downloadBlob } from '@/lib/utils';

type Doc = import('jspdf').jsPDF;

async function libs() {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable: at.autoTable };
}

const FOREST: [number, number, number] = [16, 63, 52];
const JADE: [number, number, number] = [41, 180, 127];

function watermark(doc: Doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const g = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
    if (g) (doc as unknown as { setGState: (s: unknown) => void }).setGState(new g({ opacity: 0.09 }));
    doc.setTextColor(16, 63, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(64);
    doc.text('DEMO SAMPLE', 105, 165, { angle: 35, align: 'center' });
    if (g) (doc as unknown as { setGState: (s: unknown) => void }).setGState(new g({ opacity: 1 }));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text('Demonstration document from an illustrative ERP demo. Fictional customer and prices. Not a binding offer, tax invoice or e-Invoice submission.', 105, 289, { align: 'center' });
    doc.text(`Page ${i} of ${pages}`, 196, 289, { align: 'right' });
  }
}

function header(doc: Doc, title: string, number: string, meta: [string, string][]) {
  doc.setFillColor(...FOREST);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setFillColor(...JADE);
  doc.roundedRect(14, 8, 14, 14, 3, 3, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MK', 21, 17, { align: 'center' });
  doc.setFontSize(12);
  doc.text(COMPANY.legalName, 32, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Reg. ${COMPANY.registration}  ·  ${COMPANY.address}`, 32, 18.5);
  doc.text(`${COMPANY.website}  ·  Logo placeholder — replace with authorised logo`, 32, 23);
  doc.setTextColor(...FOREST);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, 14, 42);
  doc.setFontSize(10);
  doc.text(number, 196, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  let y = 48;
  for (const [k, v] of meta) {
    doc.text(`${k}:`, 140, y);
    doc.text(v, 196, y, { align: 'right' });
    y += 4.6;
  }
  return y;
}

function partyBlock(doc: Doc, label: string, lines: string[], y: number) {
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(label.toUpperCase(), 14, y);
  doc.setTextColor(30);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(lines[0] ?? '', 14, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let yy = y + 9.5;
  for (const l of lines.slice(1)) {
    const wrapped = doc.splitTextToSize(l, 110);
    doc.text(wrapped, 14, yy);
    yy += 4.2 * wrapped.length;
  }
  return yy;
}

export type PdfMode = 'download' | { open: Window | null };

/** Open a blank tab synchronously (inside the click handler) so popup blockers allow the preview. */
export function previewWindow(): PdfMode {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;color:#103F34">Generating DEMO SAMPLE PDF…</p>');
  return { open: w };
}

let pdfMode: PdfMode = 'download';
function save(doc: Doc, name: string) {
  watermark(doc);
  const blob = doc.output('blob');
  const mode = pdfMode;
  pdfMode = 'download';
  if (mode !== 'download' && mode.open) mode.open.location.href = URL.createObjectURL(blob);
  else downloadBlob(name, blob);
  return blob;
}

/** Run a PDF builder in preview mode (opens in the tab created by previewWindow()). */
export async function withMode<T>(mode: PdfMode, fn: () => Promise<T>): Promise<T> {
  pdfMode = mode;
  try {
    return await fn();
  } finally {
    pdfMode = 'download';
  }
}

export async function quotePdf(db: DbState, q: Quote, versionNo?: number) {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const v = q.versions[(versionNo ?? q.currentVersion) - 1];
  const c = db.customers[q.customerId];
  const site = c?.sites.find((s) => s.id === q.siteId);
  const y0 = header(doc, 'QUOTATION', `${q.number} · v${v.version}`, [
    ['Date', fmtDate(v.issuedAt ?? v.createdAt)],
    ['Valid until', v.expiresAt ? fmtDate(v.expiresAt) : `${v.validityDays} day(s) from issue`],
    ['Prepared by', q.owner],
    ['Fulfilment', q.fulfilment === 'pickup' ? 'Self-pickup' : 'Delivery'],
  ]);
  const yP = partyBlock(doc, 'Quotation for', [c?.name ?? '', c?.billingAddress ?? '', c?.contacts[0] ? `Attn: ${c.contacts[0].name} (${c.contacts[0].role})` : '', site ? `Site: ${site.name}` : ''].filter(Boolean), 48);
  autoTable(doc, {
    startY: Math.max(y0, yP) + 6,
    head: [['#', 'Item', 'Qty', 'UOM', 'Unit price', 'Disc.', 'Amount']],
    body: v.lines.map((l, i) => [i + 1, `${db.products[l.productId]?.sku ?? ''}  ${l.description}${l.leadTimeDays ? `\nLead time: ${l.leadTimeDays} days` : ''}`, l.qty, l.uom, formatRM(l.unitPrice), l.discountPct ? `${l.discountPct}%` : '—', formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))]),
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: FOREST, textColor: 255 },
    columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    alternateRowStyles: { fillColor: [244, 249, 246] },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const t = v.totals;
  const rows: [string, string][] = [
    ['Subtotal', formatRM(t.subtotal)],
    ...(t.discount ? [['Discount', `-${formatRM(t.discount)}`] as [string, string]] : []),
    ...(t.freight ? [['Freight / delivery', formatRM(t.freight)] as [string, string]] : []),
    [db.config.tax.enabled ? `${db.config.tax.label} ${db.config.tax.ratePct}%` : `${db.config.tax.label} (not configured)`, formatRM(t.tax)],
  ];
  doc.setFontSize(9);
  for (const [k, val] of rows) {
    doc.text(k, 150, y, { align: 'right' });
    doc.text(val, 196, y, { align: 'right' });
    y += 5;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL (RM)', 150, y + 1, { align: 'right' });
  doc.text(formatRM(t.total), 196, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text('Terms & notes', 14, y);
  doc.setTextColor(40);
  const terms = doc.splitTextToSize(`${v.terms}${v.notes ? `\n\nNotes: ${v.notes}` : ''}`, 120);
  doc.text(terms, 14, y + 4.5);
  doc.setDrawColor(180);
  doc.line(140, y + 22, 196, y + 22);
  doc.text('Customer acceptance (sign & chop)', 168, y + 26, { align: 'center' });
  return save(doc, `${q.number}-v${v.version}-DEMO.pdf`);
}

export async function deliveryPdf(db: DbState, d: DeliveryOrder) {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const o = db.salesOrders[d.orderId];
  const c = db.customers[d.customerId];
  const site = c?.sites.find((s) => s.id === d.siteId);
  const v = d.vehicleId ? db.vehicles[d.vehicleId] : undefined;
  const drv = d.driverId ? db.drivers[d.driverId] : undefined;
  const y0 = header(doc, d.type === 'pickup' ? 'COLLECTION NOTE' : 'DELIVERY ORDER', d.number, [
    ['Sales order', o?.number ?? ''],
    ['Scheduled', fmtDate(d.scheduledDate)],
    ...(d.type === 'pickup' ? [['Collection token', d.pickupToken ?? '']] as [string, string][] : [['Vehicle', v?.plate ?? 'Not assigned'], ['Driver', drv?.name ?? '—']] as [string, string][]),
  ]);
  const yP = partyBlock(doc, d.type === 'pickup' ? 'Customer' : 'Deliver to', [c?.name ?? '', site?.address ?? c?.billingAddress ?? '', site ? `Site: ${site.name}` : ''].filter(Boolean), 48);
  autoTable(doc, {
    startY: Math.max(y0, yP) + 6,
    head: [['#', 'SKU', 'Description', 'Qty', 'UOM']],
    body: d.lines.map((l, i) => {
      const p = db.products[l.productId];
      return [i + 1, p?.sku ?? '', `${p?.name ?? ''}${p?.variantLabel ? ` — ${p.variantLabel}` : ''}`, l.qty, p?.baseUom ?? ''];
    }),
    styles: { fontSize: 9, cellPadding: 2.4 },
    headStyles: { fillColor: FOREST, textColor: 255 },
    columnStyles: { 3: { halign: 'right' } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.text(`Total weight (recorded): ${d.weightKg} kg`, 14, y);
  y += 12;
  if (d.pod) {
    doc.setTextColor(16, 106, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('PROOF OF DELIVERY', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);
    doc.text(`Received by: ${d.pod.signedName}`, 14, y + 6);
    doc.text(`Time: ${fmtDateTime(d.pod.at)}`, 14, y + 11);
    if (d.pod.note) doc.text(`Note: ${d.pod.note}`, 14, y + 16);
    if (d.pod.photo) {
      try {
        doc.addImage(d.pod.photo, 'JPEG', 130, y - 4, 60, 40);
      } catch {
        /* ignore unsupported image */
      }
    }
  } else {
    doc.setDrawColor(180);
    doc.line(14, y + 14, 80, y + 14);
    doc.line(120, y + 14, 196, y + 14);
    doc.setFontSize(8);
    doc.text('Received by (name & signature)', 14, y + 18);
    doc.text('Date / time', 120, y + 18);
  }
  return save(doc, `${d.number}-DEMO.pdf`);
}

export async function invoicePdf(db: DbState, inv: Invoice) {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = db.customers[inv.customerId];
  const y0 = header(doc, 'INVOICE (SAMPLE)', inv.number, [
    ['Issue date', fmtDate(inv.issueDate)],
    ['Due date', fmtDate(inv.dueDate)],
    ['Order', inv.orderId ? db.salesOrders[inv.orderId]?.number ?? '' : 'Counter sale'],
    ['e-Invoice', 'Not submitted (demo)'],
  ]);
  const yP = partyBlock(doc, 'Bill to', [c?.name ?? '', c?.billingAddress ?? '', c?.tin ? `TIN (placeholder): ${c.tin}` : ''].filter(Boolean), 48);
  autoTable(doc, {
    startY: Math.max(y0, yP) + 6,
    head: [['#', 'Description', 'Qty', 'UOM', 'Unit price', 'Amount']],
    body: inv.lines.map((l, i) => [i + 1, l.description, l.qty, l.uom, formatRM(l.unitPrice), formatRM(l.lineTotal)]),
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: FOREST, textColor: 255 },
    columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  for (const [k, v] of [
    ['Subtotal', formatRM(inv.subtotal)],
    ['Freight', formatRM(inv.freight)],
    [`${inv.taxLabel}${inv.taxRatePct ? ` ${inv.taxRatePct}%` : ' (not configured)'}`, formatRM(inv.tax)],
    ['Total', formatRM(inv.total)],
    ['Paid / credited', formatRM(inv.paid + inv.credited)],
    ['Balance due', formatRM(inv.total - inv.paid - inv.credited)],
  ]) {
    doc.setFontSize(9);
    doc.text(k, 150, y, { align: 'right' });
    doc.text(v, 196, y, { align: 'right' });
    y += 5;
  }
  return save(doc, `${inv.number}-SAMPLE.pdf`);
}

export async function poPdf(db: DbState, po: PurchaseOrder) {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = db.suppliers[po.supplierId];
  const y0 = header(doc, 'PURCHASE ORDER', po.number, [
    ['Date', fmtDate(po.orderedAt ?? po.createdAt)],
    ['Expected', fmtDate(po.expectedAt)],
    ['Terms', `${s?.paymentTermsDays ?? 30} days`],
    ['Currency', 'MYR (demo)'],
  ]);
  const yP = partyBlock(doc, 'Supplier (fictional)', [s?.name ?? '', s?.address ?? '', `Attn: ${s?.contactName ?? ''}`], 48);
  autoTable(doc, {
    startY: Math.max(y0, yP) + 6,
    head: [['#', 'SKU', 'Description', 'Qty', 'Unit cost', 'Amount', 'Received']],
    body: po.lines.map((l, i) => {
      const p = db.products[l.productId];
      return [i + 1, p?.sku ?? '', `${p?.name ?? ''}${p?.variantLabel ? ` — ${p.variantLabel}` : ''}`, `${l.qty} ${p?.baseUom ?? ''}`, formatRM(l.unitCost), formatRM(Math.round(l.qty * l.unitCost)), `${l.received}`];
    }),
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: FOREST, textColor: 255 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });
  return save(doc, `${po.number}-DEMO.pdf`);
}

export async function kpiPdf(title: string, rows: [string, string][], notes: string[]) {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y0 = header(doc, 'MANAGEMENT SUMMARY', title, [['Generated', fmtDateTime(new Date().toISOString())]]);
  autoTable(doc, { startY: y0 + 8, head: [['Metric', 'Value']], body: rows, styles: { fontSize: 9.5 }, headStyles: { fillColor: FOREST } });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  for (const n of notes) {
    const w = doc.splitTextToSize(`• ${n}`, 180);
    doc.text(w, 14, y);
    y += 5 * w.length;
  }
  return save(doc, `management-summary-${new Date().toISOString().slice(0, 10)}-DEMO.pdf`);
}
