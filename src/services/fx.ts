/**
 * Optional reference FX (USD→MYR) from Frankfurter (free, no key per provider docs).
 * Reference only: it NEVER auto-overwrites approved costs or selling prices.
 * Falls back to a clearly labelled synthetic rate when unavailable.
 */
export interface FxResult {
  usdMyr: number;
  source: string;
  synthetic: boolean;
  date?: string;
}

const CACHE_KEY = 'mk-erp-fx-cache';

export async function fetchUsdMyr(): Promise<FxResult> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as (FxResult & { fetchedOn: string }) | null;
    const today = new Date().toISOString().slice(0, 10);
    if (cached && cached.fetchedOn === today && !cached.synthetic) return cached;
  } catch {
    /* ignore cache errors */
  }
  const urls = ['https://api.frankfurter.dev/v2/rate/usd/myr', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=MYR'];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const j = (await res.json()) as Record<string, unknown>;
      const rate = typeof j.rate === 'number' ? j.rate : typeof (j.rates as Record<string, number> | undefined)?.MYR === 'number' ? (j.rates as Record<string, number>).MYR : undefined;
      if (rate && rate > 1 && rate < 10) {
        const out: FxResult = { usdMyr: rate, source: 'Frankfurter (ECB reference)', synthetic: false, date: (j.date as string) ?? undefined };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ...out, fetchedOn: new Date().toISOString().slice(0, 10) }));
        } catch {
          /* ignore */
        }
        return out;
      }
    } catch {
      /* try next */
    }
  }
  return { usdMyr: 4.45, source: 'Synthetic fallback (provider unavailable)', synthetic: true };
}
