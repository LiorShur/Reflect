import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { ANTHROPIC_API_KEY, callClaude } from '../anthropic/client';
import { scoreFastPath } from '../moderator/score';
import { trace } from '../telemetry/trace';
import { isValidDraftText, parseTranslatorOutput } from './turn-utils';

interface SpeakerDraft {
  raw?: string;
  committed?: boolean;
}

interface SessionMeta {
  state?: string;
  topic?: string;
}

interface CurrentTurn {
  speaker_uid?: string;
}

// Fires on every write to /sessions/{sid}/current_turn/speaker_draft.
// Only acts on the false → true commit transition; subsequent writes
// (e.g., the trigger itself reverting committed=false on a tier_3
// block) are ignored via the same guard.
//
// Sequence on commit:
//   1. moderator fast-path (M1) — tier_3 hard-blocks; tier_1/2/clean
//      proceeds to the translator
//   2. translator (Anthropic) — writes softened/changes_made/etc to
//      current_turn/translation. Speaker reviews and approves via
//      decideTranslation (next file).
//
// docs/05 § Translator + docs/10 § Moderator fast-path
export const onSpeakerDraftWritten = onValueWritten(
  {
    ref: '/sessions/{sessionId}/current_turn/speaker_draft',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const before = (event.data.before.val() as SpeakerDraft | null) ?? null;
    const after = (event.data.after.val() as SpeakerDraft | null) ?? null;

    // Only act on the transition into committed=true. Avoids loops
    // when the trigger itself reverts committed on a tier_3 block.
    const wasCommitted = before?.committed === true;
    const isCommitted = after?.committed === true;
    if (!isCommitted || wasCommitted) return;

    const sessionId = event.params.sessionId;
    const db = getDatabase();
    const t0 = Date.now();

    if (!isValidDraftText(after?.raw)) {
      logger.warn('speaker-draft trigger: invalid raw text', {
        session_id: sessionId,
      });
      await revertCommit(sessionId);
      return;
    }
    const rawText = after!.raw as string;

    const [metaSnap, turnSnap] = await Promise.all([
      db.ref(`sessions/${sessionId}/meta`).get(),
      db.ref(`sessions/${sessionId}/current_turn`).get(),
    ]);
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};
    const currentTurn = (turnSnap.val() as CurrentTurn | null) ?? {};

    if (meta.state !== 'IN_TURN') {
      logger.info('speaker-draft trigger: not in IN_TURN, skipping', {
        session_id: sessionId,
        state: meta.state,
      });
      return;
    }

    // 1. Moderator fast-path
    const modResult = scoreFastPath(rawText);

    if (modResult.tier === 'tier_3') {
      // Hard block per docs/10. Revert commit so speaker returns to
      // compose, write a flag for the UI to surface a soft warning.
      await db.ref(`sessions/${sessionId}/flags`).push({
        type: 'harsh_startup',
        severity: 3,
        target_uid: currentTurn.speaker_uid ?? null,
        created_at: Date.now(),
        moderator_flags: modResult.flags,
      });
      await revertCommit(sessionId);
      logger.info('speaker-draft tier_3 blocked', {
        session_id: sessionId,
        score: modResult.score,
        flag_count: modResult.flags.length,
      });
      return;
    }

    // 2. Translator (Claude). For M3c, tier_2 needs_escalation is
    // treated like tier_1 — the actual escalation prompt lands in M3e.
    let translatorResult: ReturnType<typeof translatorResultShape>;
    let promptVersion = 'unknown';
    let costUsd = 0;
    try {
      const claudeResponse = await callClaude({
        prompt_role: 'translator',
        inputs: {
          RAW_STATEMENT: rawText,
          TOPIC: meta.topic ?? '(unspecified)',
          FEELING_OR_NULL: 'null',
        },
      });
      promptVersion = claudeResponse.prompt_version;
      costUsd = claudeResponse.cost_usd;
      translatorResult = parseTranslatorOutput(claudeResponse.text);
    } catch (err) {
      logger.error('translator call failed', {
        session_id: sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
      // Surface a translation entry the client can render with
      // cannot_soften so the speaker still has agency to send the
      // original. Better than dead-ending with no UI feedback.
      translatorResult = {
        softened: rawText,
        already_soft: false,
        cannot_soften: true,
        changes_made:
          "We couldn't generate a softened version right now. You can still send the original.",
      };
    }

    await db.ref(`sessions/${sessionId}/current_turn/translation`).set({
      ...translatorResult,
      prompt_version: promptVersion,
      moderator_tier: modResult.tier,
      moderator_flags: modResult.flags,
      approved: false,
    });

    void trace({
      prompt_role: 'translator',
      prompt_version: promptVersion,
      model: 'claude-sonnet-4-5',
      input_text: rawText,
      output_text: translatorResult.softened,
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

// Helper: revert speaker_draft.committed=false so the speaker UI
// returns to compose. Leaves raw text intact so they can revise.
async function revertCommit(sessionId: string): Promise<void> {
  await getDatabase()
    .ref(`sessions/${sessionId}/current_turn/speaker_draft/committed`)
    .set(false);
}

// Type helper so the catch branch matches the success branch shape.
function translatorResultShape() {
  return {
    softened: '',
    already_soft: false,
    cannot_soften: false,
    changes_made: '',
  };
}
