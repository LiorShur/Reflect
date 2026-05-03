// Pure helpers for the speaker turn flow. Side-effect-free so they
// can be unit-tested without firebase-admin or the Anthropic SDK.

const MAX_DRAFT_LENGTH = 2000;

export function isValidDraftText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_DRAFT_LENGTH
  );
}

export interface TranslatorOutput {
  softened: string;
  already_soft: boolean;
  cannot_soften: boolean;
  changes_made: string;
}

// Parses the translator prompt's JSON response. The prompt says
// "Return JSON only, no preamble" but the model occasionally adds
// stray whitespace / a stray code fence. Strip those before parsing
// and validate the four expected fields. Throws with a specific
// message on malformed output so the trigger can decide whether to
// retry or fall back.
export function parseTranslatorOutput(raw: string): TranslatorOutput {
  const stripped = stripCodeFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(
      `Translator did not return valid JSON: ${
        e instanceof Error ? e.message : String(e)
      }. Got: ${stripped.slice(0, 80)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Translator returned non-object: ${typeof parsed}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.softened !== 'string') {
    throw new Error("Translator output missing 'softened' string");
  }
  if (typeof obj.already_soft !== 'boolean') {
    throw new Error("Translator output missing 'already_soft' boolean");
  }
  if (typeof obj.cannot_soften !== 'boolean') {
    throw new Error("Translator output missing 'cannot_soften' boolean");
  }
  if (typeof obj.changes_made !== 'string') {
    throw new Error("Translator output missing 'changes_made' string");
  }
  return {
    softened: obj.softened,
    already_soft: obj.already_soft,
    cannot_soften: obj.cannot_soften,
    changes_made: obj.changes_made,
  };
}

// Some models wrap JSON in ```json ... ``` blocks despite explicit
// instructions not to. Strip a single leading/trailing fence.
function stripCodeFence(s: string): string {
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1];
  return s;
}

export type TranslationDecision = 'send_softened' | 'send_original' | 'edit';

export function isValidDecision(value: unknown): value is TranslationDecision {
  return (
    value === 'send_softened' || value === 'send_original' || value === 'edit'
  );
}

// AI2 — Moderator escalation. Called when the fast-path returns
// tier_2 with needs_escalation. Claude reads the message in context
// and assigns a final tier (1 / 2 / 3) plus an optional rewrite hint.
//
// docs/05 § Moderator (escalation) + prompts/moderator-escalation.yaml.
export interface ModeratorEscalationOutput {
  tier: 1 | 2 | 3;
  reason: string;
  // null is allowed when the escalation says tier 1 — no rewrite
  // needed. The Claude prompt explicitly says "or null if tier 1".
  suggestion: string | null;
}

export function parseModeratorEscalationOutput(
  raw: string,
): ModeratorEscalationOutput {
  const stripped = stripCodeFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(
      `Moderator escalation did not return valid JSON: ${
        e instanceof Error ? e.message : String(e)
      }. Got: ${stripped.slice(0, 80)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Moderator escalation returned non-object: ${typeof parsed}`,
    );
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.tier !== 1 && obj.tier !== 2 && obj.tier !== 3) {
    throw new Error(
      `Moderator escalation 'tier' must be 1, 2, or 3; got: ${String(obj.tier)}`,
    );
  }
  if (typeof obj.reason !== 'string') {
    throw new Error("Moderator escalation output missing 'reason' string");
  }
  let suggestion: string | null;
  if (obj.suggestion === null) {
    suggestion = null;
  } else if (typeof obj.suggestion === 'string') {
    suggestion = obj.suggestion;
  } else {
    throw new Error(
      "Moderator escalation 'suggestion' must be a string or null",
    );
  }
  return { tier: obj.tier, reason: obj.reason, suggestion };
}

// Maps the numeric tier from the escalation response to the string
// the rest of the pipeline (translation.moderator_tier, fast-path
// FastPathResult['tier']) uses.
export function moderatorTierString(
  numeric: 1 | 2 | 3,
): 'tier_1' | 'tier_2' | 'tier_3' {
  if (numeric === 3) return 'tier_3';
  if (numeric === 2) return 'tier_2';
  return 'tier_1';
}

// Speaker's confirmation after seeing the listener's mirror.
// docs/04 § Speaker confirmation:
//   yes / mostly → archive + role swap → FLOOR_SWAP
//   more         → archive sub-turn, same speaker keeps floor, fresh
//                  compose, state stays IN_TURN
//   retry        → clear mirror only, listener re-mirrors with optional
//                  hint, state stays IN_TURN
//
// "yes" and "mostly" both map to status: 'heard' on the wire — the
// difference is purely UX (mostly carries an optional hint). docs/06
// (and the corresponding state-machine comment) previously suggested
// "more" also went to FLOOR_SWAP; that conflicts with the screen spec
// in docs/04 and is corrected here.
export type ConfirmStatus = 'heard' | 'more' | 'retry';

export function isValidConfirmStatus(value: unknown): value is ConfirmStatus {
  return value === 'heard' || value === 'more' || value === 'retry';
}

export interface ConfirmDecision {
  status: ConfirmStatus;
  newState: 'IN_TURN' | 'FLOOR_SWAP';
  archiveTurn: boolean;
  swapRoles: boolean;
  clearMirrorOnly: boolean;
}

// Pure planner — exported so the callable's dispatch logic is unit-
// testable without firebase-admin. The callable in confirm-turn.ts
// translates this plan into the actual RTDB multi-path update.
export function planConfirmDecision(status: ConfirmStatus): ConfirmDecision {
  if (status === 'heard') {
    return {
      status,
      newState: 'FLOOR_SWAP',
      archiveTurn: true,
      swapRoles: true,
      clearMirrorOnly: false,
    };
  }
  if (status === 'more') {
    return {
      status,
      newState: 'IN_TURN',
      archiveTurn: true,
      swapRoles: false,
      clearMirrorOnly: false,
    };
  }
  return {
    status,
    newState: 'IN_TURN',
    archiveTurn: false,
    swapRoles: false,
    clearMirrorOnly: true,
  };
}
