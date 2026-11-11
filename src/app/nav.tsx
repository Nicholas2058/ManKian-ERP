import type { TKey } from '@/i18n';
import {
  LayoutDashboard, ClipboardCheck, CirclePlay, Inbox, FileText, ShoppingCart, Users, Store, Tag, Package, Truck, Warehouse, Boxes, Building2, Wallet, ChartColumn, Settings,
} from '@/components/ui/icons';
import type { DbState } from '@/domain/state';
import type { RoleKey } from '@/domain/types';
import { canAccess, DASHBOARD_ROLES } from '@/domain/roles';
import { stockIndex } from '@/domain/inventory';

export interface NavItem {
  key: TKey;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: (db: DbState) => number;
  badgeTone?: 'orange' | 'red' | 'green';
}
export interface NavGroup {
  key: TKey;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: 'nav.overview',
    items: [
      { key: 'nav.dashboard', path: '/', icon: LayoutDashboard },
      { key: 'nav.approvals', path: '/approvals', icon: ClipboardCheck, badge: (db) => Object.values(db.approvals).filter((a) => a.status === 'pending').length, badgeTone: 'orange' },
      { key: 'nav.tour', path: '/tour', icon: CirclePlay },
    ],
  },
  {
    key: 'nav.sell',
    items: [
      { key: 'nav.enquiries', path: '/enquiries', icon: Inbox, badge: (db) => Object.values(db.enquiries).filter((e) => e.unread).length, badgeTone: 'green' },
      { key: 'nav.quotes', path: '/quotes', icon: FileText, badge: (db) => Object.values(db.quotes).filter((q) => q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status)).length, badgeTone: 'orange' },
      { key: 'nav.orders', path: '/orders', icon: ShoppingCart },
      { key: 'nav.customers', path: '/customers', icon: Users },
      { key: 'nav.pos', path: '/pos', icon: Store },
    ],
  },
  {
    key: 'nav.price',
    items: [
      { key: 'nav.pricing', path: '/pricing', icon: Tag, badge: (db) => Object.values(db.priceChanges).filter((c) => c.status === 'pending').length, badgeTone: 'red' },
      { key: 'nav.catalog', path: '/catalog', icon: Package },
    ],
  },
  {
    key: 'nav.supply',
    items: [
      { key: 'nav.procurement', path: '/procurement', icon: Building2 },
      {
        key: 'nav.inventory',
        path: '/inventory',
        icon: Boxes,
        badge: (db) => {
          const idx = stockIndex(db);
          return Object.values(db.products).filter((p) => p.status === 'active' && (idx[p.id]?.available ?? 0) + (idx[p.id]?.incoming ?? 0) < p.reorderPoint).length;
        },
        badgeTone: 'orange',
      },
      { key: 'nav.warehouse', path: '/warehouse', icon: Warehouse },
      { key: 'nav.delivery', path: '/delivery', icon: Truck },
    ],
  },
  {
    key: 'nav.finance',
    items: [
      { key: 'nav.finance2', path: '/finance', icon: Wallet },
      { key: 'nav.analytics', path: '/analytics', icon: ChartColumn },
    ],
  },
  { key: 'nav.system', items: [{ key: 'nav.settings', path: '/settings', icon: Settings }] },
];

/** Label for the home item: owner/managers see the dashboard, other roles their workspace. */
export function homeKey(role: RoleKey): TKey {
  return DASHBOARD_ROLES.includes(role) ? 'nav.dashboard' : 'nav.workspace';
}

/** Navigation filtered to the modules the demo role works in. */
export function navFor(role: RoleKey): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((it) => canAccess(role, it.path)).map((it) => (it.path === '/' ? { ...it, key: homeKey(role) } : it)) })).filter((g) => g.items.length > 0);
}

const MOBILE_PRIORITY: Record<RoleKey, string[]> = {
  owner: ['/', '/quotes', '/pricing', '/inventory'],
  sales_manager: ['/', '/approvals', '/quotes', '/pricing'],
  sales_exec: ['/', '/enquiries', '/quotes', '/catalog'],
  procurement: ['/', '/procurement', '/pricing', '/inventory'],
  wh_supervisor: ['/', '/inventory', '/warehouse', '/procurement'],
  picker: ['/', '/inventory', '/warehouse'],
  dispatcher: ['/', '/delivery', '/orders'],
  finance: ['/', '/finance', '/approvals', '/customers'],
  cashier: ['/', '/pos', '/catalog', '/customers'],
};

export function mobileTabsFor(role: RoleKey): { key: TKey; path: string; icon: NavItem['icon'] }[] {
  const all = navFor(role).flatMap((g) => g.items);
  return MOBILE_PRIORITY[role].map((p) => all.find((it) => it.path === p)).filter(Boolean).map((it) => ({ key: it!.key, path: it!.path, icon: it!.icon }));
}

export const MOBILE_TABS = mobileTabsFor('owner');
