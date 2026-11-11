import * as React from 'react';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import { useNavigate } from 'react-router-dom';
import { useDbState } from '@/store/db';
import { useSession } from '@/store/session';
import { navFor } from '@/app/nav';
import { useT } from '@/i18n';
import { ROLES, ROLE_ORDER } from '@/domain/roles';
import { formatRM } from '@/lib/money';
import { Search, FileText, Package, ShoppingCart, Users, Zap, Moon, UserCog, Building2, CirclePlay, Plus } from '@/components/ui/icons';
import { toast } from 'sonner';

export const paletteBus = { open: () => {} };

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const nav = useNavigate();
  const db = useDbState();
  const t = useT();
  const set = useSession((s) => s.set);
  const theme = useSession((s) => s.theme);
  const role = useSession((s) => s.role);
  paletteBus.open = () => setOpen(true);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    nav(path);
  };
  const products = React.useMemo(() => Object.values(db.products).filter((p) => p.status === 'active'), [db.products]);
  const quotes = React.useMemo(() => Object.values(db.quotes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 80), [db.quotes]);
  const orders = React.useMemo(() => Object.values(db.salesOrders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [db.salesOrders]);
  const pos = React.useMemo(() => Object.values(db.purchaseOrders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40), [db.purchaseOrders]);

  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink';
  const group = 'px-1 py-1 text-ink [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted';

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-forest-950/40 backdrop-blur-sm data-[state=open]:animate-[overlay-in_.15s]" />
        <D.Content className="fixed left-1/2 top-[10vh] z-[81] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)] data-[state=open]:animate-[dialog-in_.18s]">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search records, navigate and run actions</D.Description>
          <Command label="Command palette" className="flex max-h-[70vh] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-muted" />
              <Command.Input autoFocus placeholder={t('common.search')} className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none" />
              <kbd className="rounded border border-line-strong px-1.5 text-[10px] font-semibold text-muted">ESC</kbd>
            </div>
            <Command.List className="scrollbar-thin overflow-y-auto p-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No results.</Command.Empty>
              <Command.Group heading="Actions" className={group}>
                <Command.Item className={item} onSelect={() => go('/quotes/new')}>
                  <Plus className="size-4 text-brand" /> New quotation
                </Command.Item>
                <Command.Item className={item} onSelect={() => go('/pricing?tab=shock')}>
                  <Zap className="size-4 text-orange" /> Simulate a price shock
                </Command.Item>
                <Command.Item className={item} onSelect={() => go('/procurement?new=pr')}>
                  <Building2 className="size-4 text-brand" /> New purchase requisition
                </Command.Item>
                <Command.Item className={item} onSelect={() => go('/tour')}>
                  <CirclePlay className="size-4 text-brand" /> Open demo tour
                </Command.Item>
                <Command.Item
                  className={item}
                  onSelect={() => {
                    set({ theme: theme === 'dark' ? 'light' : 'dark' });
                    setOpen(false);
                  }}
                >
                  <Moon className="size-4 text-muted" /> Toggle dark mode
                </Command.Item>
                {ROLE_ORDER.map((r) => (
                  <Command.Item
                    key={r}
                    value={`switch role ${ROLES[r].label} ${ROLES[r].persona}`}
                    className={item}
                    onSelect={() => {
                      set({ role: r });
                      setOpen(false);
                      toast.info(`Demo role: ${ROLES[r].label} (${ROLES[r].persona})`);
                    }}
                  >
                    <UserCog className="size-4 text-muted" /> Switch role → {ROLES[r].label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Navigate" className={group}>
                {navFor(role).flatMap((g) => g.items).map((it) => (
                  <Command.Item key={it.path} value={`go ${t(it.key)} ${it.path}`} className={item} onSelect={() => go(it.path)}>
                    <it.icon className="size-4 text-muted" /> {t(it.key)}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Products" className={group}>
                {products.map((p) => (
                  <Command.Item key={p.id} value={`${p.sku} ${p.name} ${p.variantLabel ?? ''} ${db.brands[p.brandId]?.name}`} className={item} onSelect={() => go(`/catalog?id=${p.id}`)}>
                    <Package className="size-4 text-muted" />
                    <span className="font-mono text-xs text-muted">{p.sku}</span>
                    <span className="truncate">
                      {p.name}
                      {p.variantLabel ? ` — ${p.variantLabel}` : ''}
                    </span>
                    <span className="tabular ml-auto text-xs text-muted">{formatRM(p.basePrice)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Quotations" className={group}>
                {quotes.map((q) => (
                  <Command.Item key={q.id} value={`${q.number} ${db.customers[q.customerId]?.name} quote ${q.status}`} className={item} onSelect={() => go(`/quotes/${q.id}`)}>
                    <FileText className="size-4 text-muted" />
                    <span className="font-mono text-xs">{q.number}</span>
                    <span className="truncate">{db.customers[q.customerId]?.name}</span>
                    <span className="ml-auto text-xs text-muted">{q.status.replace('_', ' ')}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Sales orders" className={group}>
                {orders.map((o) => (
                  <Command.Item key={o.id} value={`${o.number} ${db.customers[o.customerId]?.name} order ${o.status}`} className={item} onSelect={() => go(`/orders?id=${o.id}`)}>
                    <ShoppingCart className="size-4 text-muted" />
                    <span className="font-mono text-xs">{o.number}</span>
                    <span className="truncate">{db.customers[o.customerId]?.name}</span>
                    <span className="ml-auto text-xs text-muted">{o.status.replace('_', ' ')}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Purchase orders" className={group}>
                {pos.map((o) => (
                  <Command.Item key={o.id} value={`${o.number} ${db.suppliers[o.supplierId]?.name} purchase order`} className={item} onSelect={() => go(`/procurement?tab=pos&id=${o.id}`)}>
                    <Building2 className="size-4 text-muted" />
                    <span className="font-mono text-xs">{o.number}</span>
                    <span className="truncate">{db.suppliers[o.supplierId]?.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Customers" className={group}>
                {Object.values(db.customers).map((c) => (
                  <Command.Item key={c.id} value={`${c.name} ${c.code} customer`} className={item} onSelect={() => go(`/customers?id=${c.id}`)}>
                    <Users className="size-4 text-muted" /> {c.name}
                    <span className="ml-auto text-xs text-muted">{c.code}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
