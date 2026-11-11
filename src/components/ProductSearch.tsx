import * as React from 'react';
import type { Customer, CustomerTier, Product } from '@/domain/types';
import { useDbState } from '@/store/db';
import { stockIndex } from '@/domain/inventory';
import { priceLine } from '@/domain/pricing';
import { formatRM } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Input } from './ui/core';
import { ProductArt } from './art/ProductArt';
import { Search, ScanBarcode } from './ui/icons';

export function searchProducts(products: Product[], q: string, brands: Record<string, { name: string }>, limit = 8): Product[] {
  const terms = q.toLowerCase().replace(/[“”″]/g, '"').split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { p: Product; s: number }[] = [];
  for (const p of products) {
    if (p.status !== 'active') continue;
    const hay = `${p.sku} ${p.name} ${p.variantLabel ?? ''} ${brands[p.brandId]?.name ?? ''} ${p.barcode} ${Object.values(p.specs).join(' ')}`.toLowerCase();
    let s = 0;
    let all = true;
    for (const t of terms) {
      const i = hay.indexOf(t);
      if (i < 0) {
        all = false;
        break;
      }
      s += i === 0 ? 3 : hay.includes(` ${t}`) ? 2 : 1;
    }
    if (all) scored.push({ p, s: s + (p.sku.toLowerCase().startsWith(terms[0]) ? 5 : 0) + (p.barcode === q.trim() ? 20 : 0) });
  }
  return scored.sort((a, b) => b.s - a.s || a.p.sku.localeCompare(b.p.sku)).slice(0, limit).map((x) => x.p);
}

export function ProductSearch({
  onPick,
  placeholder = 'Search SKU, name, size or scan barcode…',
  customer,
  tier,
  autoFocus,
  className,
  filter,
}: {
  onPick: (p: Product) => void;
  placeholder?: string;
  customer?: Customer;
  tier?: CustomerTier;
  autoFocus?: boolean;
  className?: string;
  filter?: (p: Product) => boolean;
}) {
  const db = useDbState();
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const listId = React.useId();
  const stock = stockIndex(db);
  const all = React.useMemo(() => Object.values(db.products).filter((p) => !filter || filter(p)), [db.products, filter]);
  const results = React.useMemo(() => searchProducts(all, q, db.brands), [all, q, db.brands]);
  const pick = (p: Product) => {
    onPick(p);
    setQ('');
    setOpen(false);
  };
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(results.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter' && results[hi]) {
            e.preventDefault();
            pick(results[hi]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className="h-11 pl-9 pr-9"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      <ScanBarcode className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      {open && q && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 max-h-[340px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-lift)] scrollbar-thin">
          {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No active SKU matches "{q}"</li>}
          {results.map((p, i) => {
            const st = stock[p.id];
            const pr = customer || tier ? priceLine(db, p, { customer, tier, qty: 1, uom: p.baseUom, at: new Date().toISOString() }) : undefined;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setHi(i)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2', i === hi && 'bg-surface-3')}
              >
                <div className="h-9 w-12 shrink-0 overflow-hidden rounded-md border border-line">
                  <ProductArt art={p.art} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.name}
                    {p.variantLabel ? ` — ${p.variantLabel}` : ''}
                  </p>
                  <p className="text-[11px] text-muted">
                    <span className="font-mono">{p.sku}</span> · {db.brands[p.brandId]?.name} ·{' '}
                    <span className={(st?.available ?? 0) > 0 ? 'text-brand' : 'text-danger'}>
                      {st?.available ?? 0} {p.baseUom} available
                    </span>
                  </p>
                </div>
                <div className="tabular shrink-0 text-right text-sm font-semibold">
                  {formatRM(pr?.unitPrice ?? p.basePrice)}
                  <span className="block text-[10px] font-normal text-muted">/ {p.baseUom}{pr?.priceSource === 'contract' ? ' · contract' : ''}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
