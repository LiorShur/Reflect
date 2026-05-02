// Pure helpers for the wrap-up flow. Side-effect-free so they can be
// unit-tested without firebase-admin or the Anthropic SDK.

export interface SummarizerOutput {
  partner_a_summary: string;
  partner_b_summary: string;
}

// Parses the wrap-up summarizer's JSON response. Same defensive
// shape-validation pattern as parseTranslatorOutput in turns/turn-utils.
export function parseSummarizerOutput(raw: string): SummarizerOutput {
  const stripped = stripCodeFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(
      `Summarizer did not return valid JSON: ${
        e instanceof Error ? e.message : String(e)
      }. Got: ${stripped.slice(0, 80)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Summarizer returned non-object: ${typeof parsed}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.partner_a_summary !== 'string') {
    throw new Error("Summarizer output missing 'partner_a_summary' string");
  }
  if (typeof obj.partner_b_summary !== 'string') {
    throw new Error("Summarizer output missing 'partner_b_summary' string");
  }
  return {
    partner_a_summary: obj.partner_a_summary,
    partner_b_summary: obj.partner_b_summary,
  };
}

function stripCodeFence(s: string): string {
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1];
  return s;
}

export interface ArchivedTurn {
  speaker_uid?: string;
  listener_uid?: string;
  delivered_text?: string;
  mirror_text?: string;
  confirmation_status?: 'heard' | 'more' | 'retry';
  archived_at?: number;
}

// Formats the archived turns for the summarizer's user_template. We
// label speakers by which partner role they had so the model can
// attribute statements without us leaking real names. Sort by
// archived_at so the conversation reads chronologically.
export function formatTurnHistory(
  turns: ArchivedTurn[],
  partnerAUid: string,
  partnerBUid: string,
): string {
  if (turns.length === 0) return '(no turns recorded)';

  const sorted = [...turns].sort(
    (a, b) => (a.archived_at ?? 0) - (b.archived_at ?? 0),
  );

  const lines: string[] = [];
  sorted.forEach((turn, i) => {
    const speakerLabel = labelFor(turn.speaker_uid, partnerAUid, partnerBUid);
    const listenerLabel = labelFor(turn.listener_uid, partnerAUid, partnerBUid);
    lines.push(`Turn ${i + 1} (${speakerLabel} speaking):`);
    if (turn.delivered_text) {
      lines.push(`  ${speakerLabel} said: ${turn.delivered_text}`);
    }
    if (turn.mirror_text) {
      lines.push(`  ${listenerLabel} reflected: ${turn.mirror_text}`);
    }
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function labelFor(
  uid: string | undefined,
  partnerAUid: string,
  partnerBUid: string,
): string {
  if (uid === partnerAUid) return 'Partner A';
  if (uid === partnerBUid) return 'Partner B';
  return 'Unknown';
}

// Whether both partners have confirmed their wrap-up summaries. Used
// by the confirm trigger to decide when to transition to ENDED.
export function bothPartnersConfirmedWrapUp(summary: {
  partner_a_confirmed?: unknown;
  partner_b_confirmed?: unknown;
}): boolean {
  return (
    summary.partner_a_confirmed === true && summary.partner_b_confirmed === true
  );
}
