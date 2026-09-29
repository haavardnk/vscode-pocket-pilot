import type { CopilotUsage, UsageMeter } from '@pocket-pilot/protocol';
import { z } from 'zod';

const count = z.number().optional().catch(undefined);

const snapshotSchema = z
  .object({
    percent_remaining: z.number(),
    unlimited: z.boolean(),
    entitlement: count,
    quota_remaining: count,
    remaining: count,
    overage_count: count,
    overage_permitted: z.boolean().optional().catch(undefined),
    quota_reset_at: count
  })
  .optional()
  .catch(undefined);

const legacySchema = z.object({ chat: count, completions: count }).optional().catch(undefined);

const text = z.string().optional().catch(undefined);

const entitlementsSchema = z.object({
  copilot_plan: text,
  access_type_sku: text,
  quota_reset_date: text,
  quota_reset_date_utc: text,
  limited_user_reset_date: text,
  quota_snapshots: z
    .object({
      chat: snapshotSchema,
      completions: snapshotSchema,
      premium_interactions: snapshotSchema
    })
    .optional()
    .catch(undefined),
  monthly_quotas: legacySchema,
  limited_user_quotas: legacySchema
});

type Snapshot = NonNullable<z.infer<typeof snapshotSchema>>;
type Entitlements = z.infer<typeof entitlementsSchema>;
type MeterKind = UsageMeter['kind'];

const PLANS: Record<string, string> = {
  free: 'Free',
  individual: 'Pro',
  individual_pro: 'Pro+',
  individual_max: 'Max',
  individual_edu: 'Education',
  business: 'Business',
  enterprise: 'Enterprise'
};

const SKUS: Record<string, string> = {
  free_limited_copilot: 'Free',
  free_educational_quota: 'Education'
};

const SNAPSHOT_KINDS = [
  ['premium_interactions', 'premium'],
  ['chat', 'chat'],
  ['completions', 'completions']
] as const;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function snapshotMeter(kind: MeterKind, snapshot: Snapshot | undefined): UsageMeter | null {
  if (!snapshot) return null;
  if (snapshot.unlimited) {
    return { kind, usedPercent: 0, used: null, total: null, unlimited: true };
  }
  const total = snapshot.entitlement;
  if (!total) return null;
  const remaining = snapshot.quota_remaining ?? snapshot.remaining;
  const usedPercent = 100 - clampPercent(snapshot.percent_remaining);
  return {
    kind,
    usedPercent,
    used: remaining === undefined ? (total * usedPercent) / 100 : Math.max(0, total - remaining),
    total,
    unlimited: false
  };
}

function legacyMeter(kind: 'chat' | 'completions', entitlements: Entitlements): UsageMeter | null {
  const total = entitlements.monthly_quotas?.[kind];
  const remaining = entitlements.limited_user_quotas?.[kind];
  if (!total || remaining === undefined) return null;
  return {
    kind,
    usedPercent: 100 - clampPercent((remaining / total) * 100),
    used: Math.max(0, total - remaining),
    total,
    unlimited: false
  };
}

function meters(entitlements: Entitlements): UsageMeter[] {
  const snapshots = entitlements.quota_snapshots;
  const fromSnapshots = SNAPSHOT_KINDS.map(([field, kind]) =>
    snapshotMeter(kind, snapshots?.[field])
  );
  const byKind = new Map(
    [legacyMeter('chat', entitlements), legacyMeter('completions', entitlements), ...fromSnapshots]
      .filter((meter) => meter !== null)
      .map((meter) => [meter.kind, meter])
  );
  return SNAPSHOT_KINDS.flatMap(([, kind]) => byKind.get(kind) ?? []);
}

function resetAt(entitlements: Entitlements): number | null {
  const snapshots = entitlements.quota_snapshots;
  const seconds = SNAPSHOT_KINDS.map(([field]) => snapshots?.[field]?.quota_reset_at).find(
    (value) => value !== undefined && value > 0
  );
  if (seconds !== undefined) return seconds * 1000;
  const date =
    entitlements.quota_reset_date_utc ??
    entitlements.quota_reset_date ??
    entitlements.limited_user_reset_date;
  const parsed = date ? Date.parse(date) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

function planName(entitlements: Entitlements): string | null {
  const sku = entitlements.access_type_sku;
  if (sku && SKUS[sku]) return SKUS[sku];
  const plan = entitlements.copilot_plan;
  return plan ? (PLANS[plan] ?? null) : null;
}

export function parseEntitlements(raw: unknown, now: number): CopilotUsage {
  const parsed = entitlementsSchema.safeParse(raw);
  const list = parsed.success ? meters(parsed.data) : [];
  if (!parsed.success || (!parsed.data.copilot_plan && list.length === 0)) {
    return { state: 'unavailable', reason: 'GitHub sent an unexpected response' };
  }
  const entitlements = parsed.data;
  const premium = list.some((meter) => meter.kind === 'premium')
    ? entitlements.quota_snapshots?.premium_interactions
    : undefined;
  return {
    state: 'ready',
    plan: planName(entitlements),
    meters: list,
    overage: premium
      ? { permitted: premium.overage_permitted ?? false, count: premium.overage_count ?? 0 }
      : null,
    resetAt: resetAt(entitlements),
    checkedAt: now
  };
}
