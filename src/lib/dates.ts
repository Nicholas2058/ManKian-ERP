import { addDays as dfAddDays, differenceInCalendarDays, formatDistanceStrict } from 'date-fns';

export const TZ = 'Asia/Kuala_Lumpur';
export type ISO = string;

const dFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const dShort = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, day: '2-digit', month: 'short' });
const dtFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const tFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const wdFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const fmtDate = (iso?: ISO | null) => (iso ? dFmt.format(new Date(iso)) : '—');
export const fmtShort = (iso?: ISO | null) => (iso ? dShort.format(new Date(iso)) : '—');
export const fmtDateTime = (iso?: ISO | null) => (iso ? dtFmt.format(new Date(iso)) : '—');
export const fmtTime = (iso?: ISO | null) => (iso ? tFmt.format(new Date(iso)) : '—');
export const fmtLongDay = (iso: ISO) => wdFmt.format(new Date(iso));

export function addDays(iso: ISO, days: number): ISO {
  return dfAddDays(new Date(iso), days).toISOString();
}
export function addHours(iso: ISO, hours: number): ISO {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}
export function addMinutes(iso: ISO, minutes: number): ISO {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Calendar date key (YYYY-MM-DD) in Malaysia time. */
export function dayKey(iso: ISO): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
}

/** Start of the Malaysia calendar day containing `iso`, as an ISO instant. */
export function startOfDayKL(iso: ISO): ISO {
  return new Date(`${dayKey(iso)}T00:00:00+08:00`).toISOString();
}

export function daysBetween(a: ISO, b: ISO): number {
  return differenceInCalendarDays(new Date(b), new Date(a));
}

/** Whole days that `due` is past `asOf` in Malaysia calendar terms (0 if not overdue). */
export function daysOverdue(due: ISO, asOf: ISO): number {
  const d = Math.round((new Date(startOfDayKL(asOf)).getTime() - new Date(startOfDayKL(due)).getTime()) / 86_400_000);
  return Math.max(0, d);
}

export function relTime(iso: ISO, now: ISO): string {
  const diff = new Date(now).getTime() - new Date(iso).getTime();
  if (Math.abs(diff) < 60_000) return 'just now';
  const s = formatDistanceStrict(new Date(iso), new Date(now));
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function isSameDayKL(a: ISO, b: ISO): boolean {
  return dayKey(a) === dayKey(b);
}
