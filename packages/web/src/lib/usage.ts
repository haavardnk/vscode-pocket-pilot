import type { CopilotUsage, UsageMeter } from '@pocket-pilot/protocol';
import { format, isSameYear } from 'date-fns';

import { ago } from './time';

type UsageTone = 'success' | 'warning' | 'error';

type ReadyUsage = Extract<CopilotUsage, { state: 'ready' }>;

const PROGRESS: Record<UsageTone, string> = {
  success: 'progress-success',
  warning: 'progress-warning',
  error: 'progress-error'
};

export const METER_LABELS: Record<UsageMeter['kind'], string> = {
  premium: 'Premium requests',
  chat: 'Chat messages',
  completions: 'Code completions'
};

const counts = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function visibleMeters(usage: CopilotUsage | null): UsageMeter[] {
  if (usage?.state !== 'ready') return [];
  return usage.meters.filter((meter) => !meter.unlimited);
}

export function premiumMeter(usage: CopilotUsage | null): UsageMeter | null {
  return visibleMeters(usage).find((meter) => meter.kind === 'premium') ?? null;
}

function usageTone(meter: UsageMeter): UsageTone {
  if (meter.usedPercent < 75) return 'success';
  return meter.usedPercent < 90 ? 'warning' : 'error';
}

export function progressClass(meter: UsageMeter): string {
  return `progress ${PROGRESS[usageTone(meter)]}`;
}

export function percentLabel(meter: UsageMeter): string {
  return `${Math.floor(meter.usedPercent)}% used`;
}

export function countLabel(meter: UsageMeter): string | null {
  if (meter.used === null || meter.total === null) return null;
  return `${counts.format(meter.used)} of ${counts.format(meter.total)}`;
}

export function resetLabel(resetAt: number, now: number): string {
  return `Resets ${format(resetAt, isSameYear(resetAt, now) ? 'd MMM' : 'd MMM yyyy')}`;
}

export function usageCaption(usage: ReadyUsage, now: number): string {
  const overage = usage.overage?.count
    ? `${counts.format(usage.overage.count)} premium requests beyond the plan this month.`
    : null;
  const reset = usage.resetAt === null ? null : `${resetLabel(usage.resetAt, now)}.`;
  const checked = `Updated ${ago(usage.checkedAt, now)}.`;
  return [overage, reset, checked].filter((part) => part !== null).join(' ');
}
