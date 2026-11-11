import type { RoleKey } from './types';

/**
 * Demo role simulation. This is a VISUAL concept only — it runs in the browser and is
 * NOT secure authorization. Real deployments need server-side authentication + RBAC.
 */
export type Permission =
  | 'price.propose' | 'price.approve' | 'price.rules'
  | 'quote.create' | 'quote.approve' | 'quote.issue'
  | 'order.create' | 'order.reserve' | 'order.cancel'
  | 'credit.override'
  | 'po.manage' | 'grn.receive'
  | 'stock.adjust' | 'pick' | 'dispatch' | 'delivery.confirm'
  | 'finance.manage' | 'pos.sell' | 'pos.discount.approve'
  | 'catalog.edit' | 'customer.edit' | 'settings.edit';

export interface RoleDef {
  key: RoleKey;
  label: string;
  persona: string;
  focus: string;
  home: string;
  perms: Permission[] | 'all';
}

export const ROLES: Record<RoleKey, RoleDef> = {
  owner: { key: 'owner', label: 'Owner / Director', persona: 'Daniel Lim', focus: 'Margins, cash collection, approvals', home: '/', perms: 'all' },
  sales_manager: {
    key: 'sales_manager', label: 'Sales Manager', persona: 'Aisyah Rahman', focus: 'RFQs, quote approval, price tiers', home: '/quotes',
    perms: ['price.propose', 'price.approve', 'price.rules', 'quote.create', 'quote.approve', 'quote.issue', 'order.create', 'order.reserve', 'order.cancel', 'customer.edit', 'catalog.edit', 'pos.discount.approve', 'pos.sell'],
  },
  sales_exec: {
    key: 'sales_exec', label: 'Sales Executive', persona: 'Kevin Tan', focus: 'Enquiries, quote builder, follow-up', home: '/enquiries',
    perms: ['quote.create', 'quote.issue', 'order.create', 'order.reserve', 'customer.edit', 'pos.sell'],
  },
  procurement: {
    key: 'procurement', label: 'Procurement', persona: 'Ravi Kumar', focus: 'Supplier costs, POs, ETAs', home: '/procurement',
    perms: ['price.propose', 'po.manage', 'grn.receive', 'catalog.edit'],
  },
  wh_supervisor: {
    key: 'wh_supervisor', label: 'Warehouse Supervisor', persona: 'Hafiz Ismail', focus: 'GRN, reservations, bins, discrepancies', home: '/inventory',
    perms: ['grn.receive', 'stock.adjust', 'pick', 'dispatch', 'order.reserve'],
  },
  picker: { key: 'picker', label: 'Warehouse Picker', persona: 'Jason Wong', focus: 'Mobile picklists & packing', home: '/inventory?tab=picking', perms: ['pick'] },
  dispatcher: {
    key: 'dispatcher', label: 'Dispatcher / Driver', persona: 'Muthu Samy', focus: 'Loads, delivery, proof of delivery', home: '/delivery',
    perms: ['dispatch', 'delivery.confirm'],
  },
  finance: {
    key: 'finance', label: 'Finance', persona: 'Grace Chong', focus: 'Invoices, payments, credit control', home: '/finance',
    perms: ['finance.manage', 'credit.override'],
  },
  cashier: { key: 'cashier', label: 'Counter Cashier', persona: 'Nur Izzati', focus: 'Walk-in sales & pickup', home: '/pos', perms: ['pos.sell'] },
};

export const ROLE_ORDER: RoleKey[] = ['owner', 'sales_manager', 'sales_exec', 'procurement', 'wh_supervisor', 'picker', 'dispatcher', 'finance', 'cashier'];

/** Roles whose home screen is the management dashboard; everyone else lands on "My workspace". */
export const DASHBOARD_ROLES: RoleKey[] = ['owner', 'sales_manager', 'finance'];

/**
 * Which modules each demo role works in (navigation + screen access).
 * Visual simulation only — production needs server-side authorisation.
 */
const MODULE_ACCESS: [string, RoleKey[] | 'all'][] = [
  ['/approvals', ['owner', 'sales_manager', 'finance']],
  ['/enquiries', ['owner', 'sales_manager', 'sales_exec']],
  ['/quotes', ['owner', 'sales_manager', 'sales_exec']],
  ['/orders', ['owner', 'sales_manager', 'sales_exec', 'wh_supervisor', 'dispatcher', 'finance']],
  ['/customers', ['owner', 'sales_manager', 'sales_exec', 'finance', 'cashier']],
  ['/pos', ['owner', 'sales_manager', 'sales_exec', 'cashier']],
  ['/pricing', ['owner', 'sales_manager', 'procurement']],
  ['/catalog', ['owner', 'sales_manager', 'sales_exec', 'procurement', 'wh_supervisor', 'cashier']],
  ['/procurement', ['owner', 'procurement', 'wh_supervisor']],
  ['/inventory', ['owner', 'sales_manager', 'sales_exec', 'procurement', 'wh_supervisor', 'picker']],
  ['/warehouse', ['owner', 'sales_manager', 'sales_exec', 'procurement', 'wh_supervisor', 'picker']],
  ['/delivery', ['owner', 'sales_manager', 'wh_supervisor', 'dispatcher']],
  ['/finance', ['owner', 'finance']],
  ['/analytics', ['owner', 'sales_manager', 'procurement', 'finance']],
  ['/settings', 'all'],
  ['/tour', 'all'],
];

function moduleFor(path: string) {
  const p = path.split('?')[0];
  return MODULE_ACCESS.find(([m]) => p === m || p.startsWith(`${m}/`));
}

export function canAccess(role: RoleKey, path: string): boolean {
  const m = moduleFor(path);
  return !m || m[1] === 'all' || m[1].includes(role);
}

/** Roles that work in the module behind a path (for "switch role" suggestions). */
export function rolesForPath(path: string): RoleKey[] {
  const m = moduleFor(path);
  return !m || m[1] === 'all' ? ROLE_ORDER : m[1];
}

export const ROLE_TONE: Record<RoleKey, string> = {
  owner: 'from-jade-500 to-forest-700',
  sales_manager: 'from-sky-500 to-blue-700',
  sales_exec: 'from-cyan-500 to-teal-700',
  procurement: 'from-violet-500 to-indigo-700',
  wh_supervisor: 'from-amber-500 to-orange-700',
  picker: 'from-orange-400 to-amber-600',
  dispatcher: 'from-rose-500 to-red-700',
  finance: 'from-emerald-500 to-green-800',
  cashier: 'from-fuchsia-500 to-purple-700',
};

export function can(role: RoleKey, perm: Permission): boolean {
  const p = ROLES[role].perms;
  return p === 'all' || p.includes(perm);
}

/** Roles able to perform a permission (for "switch role" hints). */
export function rolesWith(perm: Permission): RoleKey[] {
  return ROLE_ORDER.filter((r) => can(r, perm));
}

export const PERM_LABEL: Record<Permission, string> = {
  'price.propose': 'propose price changes',
  'price.approve': 'approve price changes',
  'price.rules': 'edit pricing rules',
  'quote.create': 'create quotations',
  'quote.approve': 'approve quotations',
  'quote.issue': 'issue quotations',
  'order.create': 'create sales orders',
  'order.reserve': 'reserve stock',
  'order.cancel': 'cancel orders',
  'credit.override': 'override credit limits',
  'po.manage': 'manage purchase orders',
  'grn.receive': 'receive goods',
  'stock.adjust': 'adjust stock',
  pick: 'pick orders',
  dispatch: 'dispatch deliveries',
  'delivery.confirm': 'confirm deliveries',
  'finance.manage': 'manage invoices & payments',
  'pos.sell': 'make counter sales',
  'pos.discount.approve': 'approve counter discounts',
  'catalog.edit': 'edit the catalog',
  'customer.edit': 'edit customers',
  'settings.edit': 'change business settings',
};
