import { getDatabase } from 'firebase-admin/database';

// Per-day project-wide cost cap on Anthropic API spend. Per
// docs/v1-scope.md, AI6 calls for a per-USER cap of $5/day; until
// that's implemented (M6) this PROJECT-WIDE cap is the safety net
// preventing a runaway bug from racking up unbounded charges.
//
// Tracked at /meta/anthropic_cost/{YYYY-MM-DD} as accumulated USD
// (number, dollars). Server-only — security rules deny client access.
export const DAILY_CAP_USD = 5.0;

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
}

// Pricing in USD per 1M tokens. Source: anthropic.com/pricing as of
// the M3a build. Update when models or rates change.
const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-7': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
};

export function computeCostUsd(model: string, usage: UsageInfo): number {
  const p = PRICING_USD_PER_1M[model];
  if (!p) {
    throw new Error(
      `Unknown model for cost computation: ${model}. Add to PRICING_USD_PER_1M.`,
    );
  }
  return (
    (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000
  );
}

// Pure helper for cap check — split out for unit testability.
export function isOverCap(currentSpendUsd: number): boolean {
  return currentSpendUsd >= DAILY_CAP_USD;
}

// UTC date key. All cost tracking aggregates against UTC days so
// rollover behavior is identical regardless of where the function
// runs.
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Reads today's accumulated spend. Throws if at-or-over the cap.
export async function assertUnderCap(now: Date = new Date()): Promise<void> {
  const key = todayKey(now);
  const snap = await getDatabase()
    .ref(`meta/anthropic_cost/${key}`)
    .once('value');
  const usd = (snap.val() as number | null) ?? 0;
  if (isOverCap(usd)) {
    throw new Error(
      `Daily Anthropic budget reached ($${usd.toFixed(
        4,
      )} >= $${DAILY_CAP_USD}). Try again tomorrow.`,
    );
  }
}

// Atomically increments today's spend after a successful call.
export async function recordCost(
  costUsd: number,
  now: Date = new Date(),
): Promise<void> {
  if (costUsd <= 0) return;
  const key = todayKey(now);
  await getDatabase()
    .ref(`meta/anthropic_cost/${key}`)
    .transaction((current: number | null) => (current ?? 0) + costUsd);
}
