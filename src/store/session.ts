import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoleKey } from '@/domain/types';

export type Theme = 'light' | 'dark' | 'system';
export type Lang = 'en' | 'ms' | 'zh';

export interface SavedView {
  id: string;
  table: string;
  name: string;
  state: { globalFilter?: string; sorting?: { id: string; desc: boolean }[]; hidden?: string[]; filters?: Record<string, string> };
}

interface SessionState {
  theme: Theme;
  density: 'comfortable' | 'compact';
  lang: Lang;
  role: RoleKey;
  sidebarCollapsed: boolean;
  onboardingDone: boolean;
  motion: 'system' | 'reduce' | 'full';
  lowPower3d: boolean;
  notifyPrefs: Record<string, boolean>;
  savedViews: SavedView[];
  tour: { scenario: string | null; step: number; minimized: boolean; startedAt?: string };
  set: (patch: Partial<Omit<SessionState, 'set'>>) => void;
}

/** UI preferences only (localStorage). Business data lives in IndexedDB. */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      theme: 'light',
      density: 'comfortable',
      lang: 'en',
      role: 'owner',
      sidebarCollapsed: false,
      onboardingDone: false,
      motion: 'system',
      lowPower3d: false,
      notifyPrefs: { pricing: true, quote: true, order: true, stock: true, procurement: true, delivery: true, finance: true, system: true },
      savedViews: [],
      tour: { scenario: null, step: 0, minimized: false },
      set: (patch) => set(patch),
    }),
    {
      name: 'mk-erp-prefs',
      version: 2,
      partialize: ({ set: _s, ...rest }) => rest,
      // v2: light is the default theme — move earlier "system" defaults to light (users can still pick dark).
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<SessionState>;
        if (version < 2 && (!st.theme || st.theme === 'system')) st.theme = 'light';
        return st as SessionState;
      },
    },
  ),
);
