import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

/** Current time as ISO, refreshed periodically (for relative dates and expiry checks). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date().toISOString());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date().toISOString()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** A single URL search param with a setter that preserves the others. */
export function useParam(name: string): [string | null, (v: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const value = sp.get(name);
  const set = React.useCallback(
    (v: string | null) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (v === null || v === '') n.delete(name);
          else n.set(name, v);
          return n;
        },
        { replace: true },
      );
    },
    [name, setSp],
  );
  return [value, set];
}

export function useMediaQuery(q: string) {
  const [m, setM] = React.useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
