import { format, formatDistanceStrict, isSameYear } from 'date-fns';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function ago(time: number, now: number): string {
  if (now - time < MINUTE) return 'just now';
  return formatDistanceStrict(time, now, { addSuffix: true });
}

export function shortAgo(time: number, now: number): string {
  const elapsed = now - time;
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return format(time, isSameYear(time, now) ? 'd MMM' : 'd MMM yyyy');
}
