import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { ANTHROPIC_API_KEY, callClaude } from '../anthropic/client';
import { scoreFastPath } from '../moderator/score';
import { trace } from '../telemetry/trace';
import {
  isValidDraftText,
  moderatorTierString,
  parseModeratorEscalationOutput,
  parseTranslatorOutput,
  type ModeratorEscalationOutput,
} from './turn-utils';

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

// Fires on every write to /sessions/{sid}/speaker_draft. Note this
// path lives at the session level (not under /current_turn) so the
// security rules can keep the speaker's draft genuinely private —
// see the broader rules refactor in firebase/database.rules.json
// (D3 fix). Only acts on the false → true commit transition;
// subsequent writes (e.g., the trigger itself reverting committed=
// false on a tier_3 block) are ignored via the same guard.
//
// Sequence on commit:
//   1. moderator fast-path (M1)
//   2. moderator escalation (AI2) for fast-path tier_2 only
//   3. translator (AI3) for tier_1 / tier_2 / clean
//
// docs/05 § Translator + docs/10 § Moderator fast-path.
export const onSpeakerDraftWritten = onValueWritten(
  {
    ref: '/sessions/{sessionId}/speaker_draft',
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

    // 2. Moderator escalation (AI2). Only fires on fast-path tier_2;
    // fast-path tier_3 is deterministic (clear contempt patterns) so
    // we don't ask Claude to second-guess. tier_1 / clean go straight
    // to the translator.
    let finalTier: 'clean' | 'tier_1' | 'tier_2' | 'tier_3' = modResult.tier;
    let escalation: ModeratorEscalationOutput | null = null;
    let escalationVersion = 'n/a';
    let escalationCost = 0;
    if (modResult.tier === 'tier_2') {
      const escTStart = Date.now();
      try {
        const histSnap = await db.ref(`sessions/${sessionId}/history`).get();
        const turnCount = histSnap.exists()
          ? Object.keys(histSnap.val() ?? {}).length
          : 0;
        const escResp = await callClaude({
          prompt_role: 'moderator_escalation',
          inputs: {
            RAW_MESSAGE: rawText,
            FLAGS: JSON.stringify(modResult.flags.map((f) => f.type)),
            TURN_COUNT: turnCount,
          },
        });
        escalationVersion = escResp.prompt_version;
        escalationCost = escResp.cost_usd;
        escalation = parseModeratorEscalationOutput(escResp.text);
        finalTier = moderatorTierString(escalation.tier);
        logger.info('moderator escalation applied', {
          session_id: sessionId,
          fastpath_tier: modResult.tier,
          final_tier: finalTier,
        });
      } catch (err) {
        // Fail-soft: fall back to fast-path tier_2. The translator
        // still runs and the speaker still sees a (generic) banner.
        logger.warn('moderator escalation failed; falling back to fast-path', {
          session_id: sessionId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      void trace({
        prompt_role: 'moderator_escalation',
        prompt_version: escalationVersion,
        model: 'claude-sonnet-4-5',
        input_text: rawText,
        output_text: escalation
          ? `tier=${escalation.tier}; ${escalation.reason}`
          : '(failed)',
        latency_ms: Date.now() - escTStart,
        cost_usd: escalationCost,
        session_id: sessionId,
      }).catch(() => {});
    }

    if (finalTier === 'tier_3') {
      // Hard block per docs/10. Revert commit so speaker returns to
      // compose, write a flag with the escalation reason/suggestion
      // when available so the compose-side warning is specific.
      await db.ref(`sessions/${sessionId}/flags`).push({
        type: 'harsh_startup',
        severity: 3,
        target_uid: currentTurn.speaker_uid ?? null,
        created_at: Date.now(),
        moderator_flags: modResult.flags,
        reason: escalation?.reason ?? null,
        suggestion: escalation?.suggestion ?? null,
        escalated: escalation !== null,
      });
      await revertCommit(sessionId);
      logger.info('speaker-draft tier_3 blocked', {
        session_id: sessionId,
        fastpath_tier: modResult.tier,
        final_tier: finalTier,
        escalated: escalation !== null,
      });
      return;
    }

    // 3. Translator (Claude). finalTier (post-escalation) drives the
    // banner the speaker sees on the review screen.
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
      moderator_tier: finalTier,
      moderator_fastpath_tier: modResult.tier,
      moderator_flags: modResult.flags,
      moderator_suggestion: escalation?.suggestion ?? null,
      moderator_reason: escalation?.reason ?? null,
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
    .ref(`sessions/${sessionId}/speaker_draft/committed`)
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
