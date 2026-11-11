import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic PRNG (mulberry32) for reproducible seed data. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number) => next() * (max - min) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T,>(arr: T[]): T[] => {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
  };
}
export type Rng = ReturnType<typeof createRng>;

export function groupBy<T, K extends string | number>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function sumBy<T>(items: T[], f: (t: T) => number): number {
  let s = 0;
  for (const it of items) s += f(it);
  return s;
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
