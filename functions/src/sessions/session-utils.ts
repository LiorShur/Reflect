// Pure helpers for the session lifecycle. Side-effect-free so they're
// unit-testable without firebase-admin. The actual session reads/writes
// live in create-session.ts and topic.ts.

import type { SessionState } from '../orchestrator/state-machine';

export type Tier = 'low' | 'moderate' | 'high';

export interface ScreeningRecord {
  completed_at?: number;
  tier?: Tier;
}

export interface PartnerScreening {
  selfTier: Tier | null;
  partnerTier: Tier | null;
}

export interface CheckIn {
  flooding_score?: number; // 1-10
  ready?: boolean;
}

// Eligibility for creating a conflict-mode session.
//
// docs/07 § Tier responses:
//   low      → joint conflict mode enabled
//   moderate → joint conflict mode disabled
//   high     → joint conflict mode never appears
// CLAUDE.md safety rail #4: never bypass safety screening — both
// partners must have completed screening AND be at the low tier.
export function canCreateConflictSession(
  s: PartnerScreening,
): { ok: true } | { ok: false; reason: string } {
  if (!s.selfTier) {
    return { ok: false, reason: 'You need to complete the check-in first.' };
  }
  if (!s.partnerTier) {
    return {
      ok: false,
      reason: 'Your partner needs to complete the check-in first.',
    };
  }
  if (s.selfTier !== 'low') {
    return {
      ok: false,
      reason: 'Joint sessions are paused based on your latest check-in.',
    };
  }
  if (s.partnerTier !== 'low') {
    return {
      ok: false,
      reason: 'Joint sessions are paused based on your partner’s check-in.',
    };
  }
  return { ok: true };
}

// docs/06: CHECK_IN → TOPIC_INTAKE iff "both ready, both score ≤ 7".
// docs/06: CHECK_IN → PAUSED iff "either score ≥ 8".
// This pure helper decides the next state the orchestrator should write
// based on the current pair of check-ins.
export type CheckInDecision =
  | { advance: 'TOPIC_INTAKE' }
  | { advance: 'PAUSED'; reason: 'flooding' }
  | { wait: true };

export function decideCheckInTransition(
  a: CheckIn | null,
  b: CheckIn | null,
): CheckInDecision {
  // If either partner has flagged flooding (score ≥ 8), pause
  // immediately even if the other hasn't submitted yet — reduces the
  // window where they sit waiting on a partner who shouldn't proceed.
  if (isFlooding(a) || isFlooding(b)) {
    return { advance: 'PAUSED', reason: 'flooding' };
  }
  if (!isReady(a) || !isReady(b)) {
    return { wait: true };
  }
  return { advance: 'TOPIC_INTAKE' };
}

function isReady(c: CheckIn | null): boolean {
  return (
    !!c &&
    c.ready === true &&
    typeof c.flooding_score === 'number' &&
    c.flooding_score <= 7
  );
}

// Exported for the checkin trigger so it can write per-partner
// readiness flags to meta (so each client can render a "you're
// ready, waiting for partner" or "your partner is ready" view
// without leaking the score across the partner boundary).
export function checkInReady(c: CheckIn | null): boolean {
  return isReady(c);
}

function isFlooding(c: CheckIn | null): boolean {
  return !!c && typeof c.flooding_score === 'number' && c.flooding_score >= 8;
}

// Valid scores, used by client validation + server validation.
export function isValidFloodingScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

// Whether a state allows the topic-related operations.
export function canProposeTopic(state: SessionState | undefined): boolean {
  return state === 'TOPIC_INTAKE';
}

export function canRespondToTopic(state: SessionState | undefined): boolean {
  return state === 'TOPIC_AGREE';
}
