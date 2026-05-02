import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { ANTHROPIC_API_KEY, callClaude } from '../anthropic/client';
import { trace } from '../telemetry/trace';
import {
  formatTurnHistory,
  parseSummarizerOutput,
  type ArchivedTurn,
} from './wrap-up-utils';

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
  topic?: string;
}

// Fires whenever meta/state changes. Acts only on the transition INTO
// WRAP_UP — that's the moment requestSessionEnd has finished writing
// state=WRAP_UP and we owe both partners a Claude-generated summary.
//
// Async by design: this trigger fires after requestSessionEnd has
// already returned to the second-acker. While Claude generates (~2-4s
// per docs/05), the WrapUpView client-side renders a spinner waiting
// for /summary/* to populate.
//
// On Claude failure, fall back to a literal recap built from the turn
// history so partners still get a usable confirmation surface — same
// fail-soft pattern as speaker-draft-trigger.ts.
export const onMetaStateWritten = onValueWritten(
  {
    ref: '/sessions/{sessionId}/meta/state',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (before === 'WRAP_UP' || after !== 'WRAP_UP') return;

    const sessionId = event.params.sessionId;
    const db = getDatabase();
    const t0 = Date.now();

    // Skip if a summary already exists (e.g., re-trigger after
    // partner_a_confirmed write somehow re-fires this).
    const existingSnap = await db
      .ref(`sessions/${sessionId}/summary/partner_a_summary`)
      .get();
    if (existingSnap.exists()) {
      logger.info('wrap-up trigger: summary already present, skipping', {
        session_id: sessionId,
      });
      return;
    }

    const [metaSnap, historySnap] = await Promise.all([
      db.ref(`sessions/${sessionId}/meta`).get(),
      db.ref(`sessions/${sessionId}/history`).get(),
    ]);
    if (!metaSnap.exists()) {
      logger.warn('wrap-up trigger: meta missing', { session_id: sessionId });
      return;
    }
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};
    if (!meta.partnerA || !meta.partnerB) {
      logger.warn('wrap-up trigger: missing partner uids', {
        session_id: sessionId,
      });
      return;
    }

    const historyVal =
      (historySnap.val() as Record<string, ArchivedTurn> | null) ?? {};
    const turns = Object.values(historyVal);
    const turnHistoryText = formatTurnHistory(
      turns,
      meta.partnerA,
      meta.partnerB,
    );

    let summary: { partner_a_summary: string; partner_b_summary: string };
    let promptVersion = 'unknown';
    let costUsd = 0;
    try {
      const claudeResponse = await callClaude({
        prompt_role: 'wrap_up_summarizer',
        inputs: {
          TOPIC: meta.topic ?? '(unspecified)',
          TURN_HISTORY: turnHistoryText,
          // We don't store display names in session meta yet (lands in
          // M5 with the appreciation feed). Use role placeholders so
          // the prompt has something to anchor on without leaking
          // unredacted identity.
          PARTNER_A_NAME: 'Partner A',
          PARTNER_B_NAME: 'Partner B',
        },
      });
      promptVersion = claudeResponse.prompt_version;
      costUsd = claudeResponse.cost_usd;
      summary = parseSummarizerOutput(claudeResponse.text);
    } catch (err) {
      logger.error('wrap-up summarizer call failed', {
        session_id: sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
      summary = fallbackSummary(turns, meta.partnerA, meta.partnerB);
    }

    await db.ref(`sessions/${sessionId}/summary`).update({
      partner_a_summary: summary.partner_a_summary,
      partner_b_summary: summary.partner_b_summary,
      prompt_version: promptVersion,
      generated_at: Date.now(),
    });

    void trace({
      prompt_role: 'wrap_up_summarizer',
      prompt_version: promptVersion,
      model: 'claude-sonnet-4-5',
      input_text: turnHistoryText,
      output_text: `${summary.partner_a_summary}\n${summary.partner_b_summary}`,
      latency_ms: Date.now() - t0,
      cost_usd: costUsd,
      session_id: sessionId,
    }).catch((e) =>
      logger.warn('telemetry trace failed', {
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  },
);

// Best-effort recap when Claude fails. Concatenates each partner's
// most recent statement so the WrapUpView still has something to
// render. Better than dead-ending on a blank screen.
function fallbackSummary(
  turns: ArchivedTurn[],
  partnerAUid: string,
  partnerBUid: string,
): { partner_a_summary: string; partner_b_summary: string } {
  const lastByPartner = (uid: string): string => {
    const theirs = turns
      .filter((t) => t.speaker_uid === uid && !!t.delivered_text)
      .sort((a, b) => (b.archived_at ?? 0) - (a.archived_at ?? 0));
    return (
      theirs[0]?.delivered_text ||
      "We couldn't generate a summary right now. Please review the conversation directly."
    );
  };
  return {
    partner_a_summary: lastByPartner(partnerAUid),
    partner_b_summary: lastByPartner(partnerBUid),
  };
}
