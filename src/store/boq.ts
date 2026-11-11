import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UomCode } from '@/domain/types';

export interface BoqLine {
  productId: string;
  qty: number;
  uom: UomCode;
}

/** Project material list (BOQ basket). Not a checkout — it becomes a quotation request. */
export const useBoq = create<{ lines: BoqLine[]; project: string; add: (l: BoqLine) => void; set: (lines: BoqLine[]) => void; setProject: (p: string) => void; clear: () => void }>()(
  persist(
    (set, get) => ({
      lines: [],
      project: '',
      add: (l) => {
        const ex = get().lines.find((x) => x.productId === l.productId && x.uom === l.uom);
        set({ lines: ex ? get().lines.map((x) => (x === ex ? { ...x, qty: x.qty + l.qty } : x)) : [...get().lines, l] });
      },
      set: (lines) => set({ lines }),
      setProject: (project) => set({ project }),
      clear: () => set({ lines: [], project: '' }),
    }),
    { name: 'mk-erp-boq' },
  ),
);
