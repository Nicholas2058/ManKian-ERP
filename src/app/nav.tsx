import type { TKey } from '@/i18n';
import {
  LayoutDashboard, ClipboardCheck, CirclePlay, Inbox, FileText, ShoppingCart, Users, Store, Tag, Package, Truck, Warehouse, Boxes, Building2, Wallet, ChartColumn, Settings,
} from '@/components/ui/icons';
import type { DbState } from '@/domain/state';
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

export const MOBILE_TABS: { key: TKey; path: string; icon: NavItem['icon'] }[] = [
  { key: 'nav.dashboard', path: '/', icon: LayoutDashboard },
  { key: 'nav.quotes', path: '/quotes', icon: FileText },
  { key: 'nav.pricing', path: '/pricing', icon: Tag },
  { key: 'nav.inventory', path: '/inventory', icon: Boxes },
];
