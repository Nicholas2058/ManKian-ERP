import * as React from 'react';
import type { ID } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { adjustStock, transferStock, quarantineStock, releaseQuarantine, receiveReturn, ADJUST_REASONS } from '@/domain/commands/inventory';
import { homeBins, productStock } from '@/domain/inventory';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Modal, Segmented } from '@/components/ui/overlay';
import { ProductSearch } from '@/components/ProductSearch';

function useBins() {
  const db = useDbState();
  return React.useMemo(() => Object.values(db.bins).filter((b) => b.kind === 'rack' || b.kind === 'floor').sort((a, b) => a.code.localeCompare(b.code)), [db.bins]);
}

export function AdjustModal({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId?: ID }) {
  const db = useDbState();
  const bins = useBins();
  const [pid, setPid] = React.useState<string | undefined>(productId);
  const [bin, setBin] = React.useState('');
  const [delta, setDelta] = React.useState('');
  const [reason, setReason] = React.useState<string>(ADJUST_REASONS[0]);
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setPid(productId);
      setDelta('');
      setNote('');
    }
  }, [open, productId]);
  const p = pid ? db.products[pid] : undefined;
  React.useEffect(() => {
    if (p) setBin(homeBins(db, p.id)[0] ?? bins[0]?.id ?? '');
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = p ? productStock(db, p.id) : undefined;
  const inBin = p ? Object.values(db.binStock).filter((b) => b.productId === p.id && b.binId === bin && b.status === 'ok').reduce((s, b) => s + b.qty, 0) : 0;
  const d = Number(delta);
  const err = !p ? 'Choose a product' : !d ? 'Enter a non-zero quantity' : d < 0 && -d > inBin ? `Bin holds only ${inBin}` : d < 0 && st && -d > st.available ? `Only ${st.available} unreserved — release reservations first` : undefined;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Stock adjustment"
      description="Every adjustment needs a reason and is written to the inventory ledger and audit log."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!!err} onClick={() => act(adjustStock, { productId: p!.id, binId: bin, delta: d, reason, note }, { success: (n) => `${n} posted` }) !== undefined && onOpenChange(false)}>
            Post adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!productId && <ProductSearch onPick={(x) => setPid(x.id)} />}
        {p && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name} {p.variantLabel ?? ''} · on hand {st?.onHand}, reserved {st?.reserved}, available {st?.available} {p.baseUom}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bin" hint={p ? `Bin holds ${inBin} ${p.baseUom}` : undefined}>
            <Select value={bin} onChange={(e) => setBin(e.target.value)}>
              {bins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity change (+/−, base units)" error={d ? err : undefined}>
            <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -3 or 12" />
          </Field>
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUST_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Count sheet ref, etc." />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function TransferModal({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId: ID }) {
  const db = useDbState();
  const bins = useBins();
  const from = Object.values(db.binStock).filter((b) => b.productId === productId && b.status === 'ok' && (db.bins[b.binId].kind === 'rack' || db.bins[b.binId].kind === 'floor'));
  const [fromBin, setFrom] = React.useState(from[0]?.binId ?? '');
  const [to, setTo] = React.useState('');
  const [qty, setQty] = React.useState('');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Bin transfer"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!to || !(Number(qty) > 0)} onClick={() => act(transferStock, { productId, fromBinId: fromBin, toBinId: to, qty: Number(qty) }, { success: 'Transfer posted' }) !== undefined && onOpenChange(false)}>
            Transfer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="From bin">
          <Select value={fromBin} onChange={(e) => setFrom(e.target.value)}>
            {from.map((b) => (
              <option key={b.binId} value={b.binId}>
                {db.bins[b.binId].code} ({b.qty})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To bin">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Select…</option>
            {bins
              .filter((b) => b.id !== fromBin)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Quantity">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function QuarantineModal({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId: ID }) {
  const db = useDbState();
  const from = Object.values(db.binStock).filter((b) => b.productId === productId && b.status === 'ok' && db.bins[b.binId].kind !== 'staging');
  const blocked = Object.values(db.binStock).filter((b) => b.productId === productId && b.status !== 'ok');
  const [mode, setMode] = React.useState<'block' | 'release'>('block');
  const [bin, setBin] = React.useState(from[0]?.binId ?? '');
  const [rec, setRec] = React.useState(blocked[0]?.id ?? '');
  const [qty, setQty] = React.useState('1');
  const [reason, setReason] = React.useState('Suspected damage — inspection');
  const [writeOff, setWriteOff] = React.useState(false);
  const toBin = homeBins(db, productId)[0] ?? from[0]?.binId;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Quarantine / release"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const r = mode === 'block' ? act(quarantineStock, { productId, binId: bin, qty: Number(qty), reason }, { success: 'Moved to quarantine (blocked from sale)' }) : act(releaseQuarantine, { binStockId: rec, toBinId: toBin, qty: Number(qty), writeOff, reason }, { success: writeOff ? 'Written off' : 'Released back to stock' });
              if (r !== undefined) onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <Segmented id="qm" value={mode} onChange={setMode} options={[{ value: 'block', label: 'Quarantine' }, { value: 'release', label: `Release (${blocked.length})` }]} />
      <div className="mt-3 space-y-3">
        {mode === 'block' ? (
          <Field label="From bin">
            <Select value={bin} onChange={(e) => setBin(e.target.value)}>
              {from.map((b) => (
                <option key={b.binId} value={b.binId}>
                  {db.bins[b.binId].code} ({b.qty})
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Blocked stock">
              <Select value={rec} onChange={(e) => setRec(e.target.value)}>
                {blocked.map((b) => (
                  <option key={b.id} value={b.id}>
                    {db.bins[b.binId].code} · {b.status} · {b.qty}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={writeOff} onChange={(e) => setWriteOff(e.target.checked)} className="accent-[var(--danger)]" /> Write off instead of returning to stock
            </label>
          </>
        )}
        <Field label="Quantity">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px]" />
        </Field>
      </div>
    </Modal>
  );
}

export function ReturnModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const [pid, setPid] = React.useState<string>();
  const [qty, setQty] = React.useState('1');
  const [cond, setCond] = React.useState<'resaleable' | 'damaged'>('resaleable');
  const [reason, setReason] = React.useState('Customer over-ordered');
  const p = pid ? db.products[pid] : undefined;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Receive customer return"
      description="Resaleable goods go back to the home bin; damaged goods to quarantine. Issue any credit note from Finance."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!p} onClick={() => act(receiveReturn, { productId: p!.id, qty: Number(qty), condition: cond, binId: homeBins(db, p!.id)[0] ?? Object.values(db.bins)[0].id, reason }, { success: (r) => `${r.number} received` }) !== undefined && onOpenChange(false)}>
            Receive return
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ProductSearch onPick={(x) => setPid(x.id)} />
        {p && (
          <p className="text-sm">
            <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name} {p.variantLabel ?? ''}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity (base units)">
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Condition">
            <Segmented id="rc" value={cond} onChange={setCond} options={[{ value: 'resaleable', label: 'Resaleable' }, { value: 'damaged', label: 'Damaged' }]} />
          </Field>
        </div>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
