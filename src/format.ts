const MS_PER_DAY = 86_400_000;

/** Format a count with thousands separators. */
export function formatNumber(n: number): string {
  return n.toLocaleString('en');
}

/** Whole days between an ISO timestamp and `now` (epoch ms), never negative. */
export function ageDays(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / MS_PER_DAY));
}

/** Human readable age: "today", "1 day", "12 days", "3 months". */
export function ageText(days: number): string {
  if (days < 1) {
    return 'today';
  }
  if (days === 1) {
    return '1 day';
  }
  if (days < 60) {
    return `${String(days)} days`;
  }
  return `${String(Math.round(days / 30))} months`;
}
