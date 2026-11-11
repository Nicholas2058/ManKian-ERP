import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog as D } from 'radix-ui';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useT, LANG_LABEL } from '@/i18n';
import { useSession, type Lang, type Theme } from '@/store/session';
import { run, useDbState } from '@/store/db';
import { ROLES, ROLE_ORDER } from '@/domain/roles';
import { fmtLongDay, relTime } from '@/lib/dates';
import { markNotificationsRead } from '@/domain/commands/system';
import { Button, Kbd } from '@/components/ui/core';
import { Menu, MenuItem, MenuLabel, MenuSep, Pop, Tip } from '@/components/ui/overlay';
import {
  Bell, ChevronDown, CirclePlay, Command as CmdIcon, FileText, Inbox, Languages, Menu as MenuIcon, Monitor, Moon, Plus, Search, Sun, Truck, Warehouse, Building2, SlidersHorizontal, UserCog, Check, X,
} from '@/components/ui/icons';
import { paletteBus } from './CommandPalette';
import { BrandMark } from './Brand';
import { NavList } from './Sidebar';

export function Topbar() {
  const t = useT();
  const nav = useNavigate();
  const [drawer, setDrawer] = React.useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
          <MenuIcon className="size-5" />
        </Button>
        <button onClick={() => nav('/')} className="rounded-xl bg-forest-900 px-2 py-1 lg:hidden" aria-label="Home">
          <BrandMark collapsed />
        </button>
        <button
          onClick={() => paletteBus.open()}
          className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-left text-sm text-muted shadow-sm transition hover:border-line-strong sm:max-w-md"
          aria-label="Open command palette"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{t('common.search')}</span>
          <span className="ml-auto hidden items-center gap-1 sm:flex">
            <Kbd>
              <CmdIcon className="inline size-2.5" />K
            </Kbd>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Tip content="Single illustrative warehouse — not an actual MK Hardware facility layout">
            <div className="hidden h-10 items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-xs font-medium text-muted xl:flex">
              <Warehouse className="size-4 text-brand" />
              Puchong · Main WH <span className="rounded bg-surface-3 px-1 text-[10px]">illustrative</span>
            </div>
          </Tip>
          <div className="hidden px-2 text-xs text-muted 2xl:block">{fmtLongDay(new Date().toISOString())}</div>
          <NewMenu />
          <Tip content="Demo tour">
            <Button variant="ghost" size="icon" onClick={() => nav('/tour')} aria-label="Demo tour" className="hidden sm:inline-flex">
              <CirclePlay className="size-5" />
            </Button>
          </Tip>
          <Notifications />
          <PrefsMenu />
          <RoleSwitcher />
        </div>
      </div>
      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-forest-950/40 data-[state=open]:animate-[overlay-in_.2s]" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[300px] flex-col bg-forest-900 data-[state=closed]:animate-[drawer-left-out_.2s] data-[state=open]:animate-[drawer-left-in_.25s]">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation</D.Description>
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <BrandMark />
              <D.Close className="rounded-lg p-2 text-white/70 hover:bg-white/10" aria-label="Close navigation">
                <X className="size-5" />
              </D.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </header>
  );
}

function NewMenu() {
  const nav = useNavigate();
  const t = useT();
  return (
    <Menu
      trigger={
        <Button size="md" className="h-10 px-3 sm:px-4" aria-label="Create new">
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t('common.new')}</span>
        </Button>
      }
    >
      <MenuLabel>Create</MenuLabel>
      <MenuItem icon={<FileText className="size-4" />} onSelect={() => nav('/quotes/new')}>
        Quotation
      </MenuItem>
      <MenuItem icon={<Inbox className="size-4" />} onSelect={() => nav('/enquiries?new=1')}>
        RFQ / enquiry (simulated inbound)
      </MenuItem>
      <MenuItem icon={<Building2 className="size-4" />} onSelect={() => nav('/procurement?new=po')}>
        Purchase order
      </MenuItem>
      <MenuItem icon={<SlidersHorizontal className="size-4" />} onSelect={() => nav('/inventory?new=adjust')}>
        Stock adjustment
      </MenuItem>
      <MenuItem icon={<Truck className="size-4" />} onSelect={() => nav('/delivery?new=do')}>
        Delivery order
      </MenuItem>
    </Menu>
  );
}

function Notifications() {
  const db = useDbState();
  const nav = useNavigate();
  const prefs = useSession((s) => s.notifyPrefs);
  const list = React.useMemo(
    () => Object.values(db.notifications).filter((n) => prefs[n.kind] !== false).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
    [db.notifications, prefs],
  );
  const unread = list.filter((n) => !n.read).length;
  const now = new Date().toISOString();
  const dot = { info: 'bg-info', success: 'bg-accent', warning: 'bg-warn', critical: 'bg-danger' };
  return (
    <Pop
      className="w-[min(92vw,380px)]"
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
          <Bell className="size-5" />
          {unread > 0 && <span className="tabular absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-ember-500 px-1 text-[9px] font-bold leading-4 text-forest-950">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm font-semibold">Notifications</p>
        <Button variant="ghost" size="xs" onClick={() => run(markNotificationsRead, {})} disabled={!unread}>
          <Check className="size-3.5" /> Mark all read
        </Button>
      </div>
      <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
        {list.length === 0 && <p className="p-6 text-center text-sm text-muted">You're all caught up.</p>}
        {list.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              run(markNotificationsRead, { ids: [n.id] });
              if (n.link) nav(n.link);
            }}
            className={cn('flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2', !n.read && 'bg-accent-soft/40')}
          >
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot[n.severity])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
              <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>
              <span className="mt-0.5 block text-[11px] text-muted/80">{relTime(n.at, now)}</span>
            </span>
          </button>
        ))}
      </div>
    </Pop>
  );
}

function PrefsMenu() {
  const theme = useSession((s) => s.theme);
  const lang = useSession((s) => s.lang);
  const set = useSession((s) => s.set);
  const themes: { v: Theme; label: string; icon: React.ReactNode }[] = [
    { v: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { v: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
    { v: 'system', label: 'System', icon: <Monitor className="size-4" /> },
  ];
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Theme and language">
          {theme === 'dark' ? <Moon className="size-5" /> : theme === 'light' ? <Sun className="size-5" /> : <Languages className="size-5" />}
        </Button>
      }
    >
      <MenuLabel>Theme</MenuLabel>
      {themes.map((x) => (
        <MenuItem key={x.v} icon={x.icon} onSelect={() => set({ theme: x.v })} hint={theme === x.v ? <Check className="size-4 text-brand" /> : undefined}>
          {x.label}
        </MenuItem>
      ))}
      <MenuSep />
      <MenuLabel>Language</MenuLabel>
      {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
        <MenuItem key={l} icon={<Languages className="size-4" />} onSelect={() => set({ lang: l })} hint={lang === l ? <Check className="size-4 text-brand" /> : undefined}>
          {LANG_LABEL[l]}
        </MenuItem>
      ))}
    </Menu>
  );
}

export function RoleSwitcher() {
  const role = useSession((s) => s.role);
  const set = useSession((s) => s.set);
  const r = ROLES[role];
  return (
    <Menu
      className="w-[min(92vw,320px)]"
      trigger={
        <button className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface pl-1.5 pr-2 text-left shadow-sm hover:border-line-strong" aria-label={`Demo role: ${r.label}`} data-tour="role-switcher">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-jade-500 to-forest-700 text-[11px] font-bold text-white">
            {r.persona.split(' ').map((p) => p[0]).join('')}
          </span>
          <span className="hidden min-w-0 leading-tight md:block">
            <span className="block max-w-[140px] truncate text-xs font-semibold text-ink">{r.label}</span>
            <span className="block text-[10px] text-muted">demo role</span>
          </span>
          <ChevronDown className="size-3.5 text-muted" />
        </button>
      }
    >
      <div className="mx-1 mb-1 rounded-lg bg-warn-soft px-2.5 py-2 text-[11px] leading-snug text-ink-2">
        <b>Role simulation only.</b> Switching roles changes visible controls to illustrate permissions. It is not authentication and is not secure.
      </div>
      {ROLE_ORDER.map((k) => (
        <MenuItem
          key={k}
          icon={<UserCog className="size-4" />}
          onSelect={() => {
            set({ role: k });
            toast.info(`Demo role: ${ROLES[k].label} (${ROLES[k].persona})`);
          }}
          hint={role === k ? <Check className="size-4 text-brand" /> : undefined}
        >
          <span className="block font-medium">{ROLES[k].label}</span>
          <span className="block text-[11px] text-muted">
            {ROLES[k].persona} · {ROLES[k].focus}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
