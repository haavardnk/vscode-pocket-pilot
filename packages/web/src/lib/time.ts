import { formatDistanceStrict } from 'date-fns';

export function ago(time: number, now: number): string {
  if (now - time < 60_000) return 'just now';
  return formatDistanceStrict(time, now, { addSuffix: true });
}
