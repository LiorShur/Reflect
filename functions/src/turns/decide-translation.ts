import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { recordTranslatorFeedback } from '../telemetry/translator-feedback';
import { isValidDecision, type TranslationDecision } from './turn-utils';

interface DecideTranslationRequest {
  session_id?: unknown;
  decision?: unknown;
}

interface CurrentTurn {
  speaker_uid?: string;
  translation?: {
    softened?: string;
    approved?: boolean;
    prompt_version?: string;
    moderator_tier?: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
  };
}

interface SpeakerDraft {
  raw?: string;
  committed?: boolean;
}

// Speaker decides what to do with the translator's output:
//   'send_softened' → softened text becomes delivered.text
//   'send_original' → speaker_draft.raw becomes delivered.text
//   'edit'          → translation cleared, speaker_draft.committed
//                     reset to false so speaker returns to compose
//
// speaker_draft lives at the session level (sibling of current_turn)
// post-D3 rules refactor — security rules can keep it private.
//
// docs/05 § Translator and the speaker-autonomy principle in
// docs/01: the speaker has final authority over their own words.
export const decideTranslation = onCall<
  DecideTranslationRequest,
  Promise<{ ok: true }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const sessionId = request.data?.session_id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new HttpsError('invalid-argument', 'session_id is required.');
  }

  const decision = request.data?.decision;
  if (!isValidDecision(decision)) {
    throw new HttpsError(
      'invalid-argument',
      "decision must be 'send_softened' | 'send_original' | 'edit'.",
    );
  }

  const db = getDatabase();
  const [turnSnap, draftSnap] = await Promise.all([
    db.ref(`sessions/${sessionId}/current_turn`).get(),
    db.ref(`sessions/${sessionId}/speaker_draft`).get(),
  ]);
  if (!turnSnap.exists()) {
    throw new HttpsError('not-found', 'Session has no current turn.');
  }
  const turn = (turnSnap.val() as CurrentTurn | null) ?? {};
  const draft = (draftSnap.val() as SpeakerDraft | null) ?? {};

  if (turn.speaker_uid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the current speaker can decide on a translation.',
    );
  }

  // Translation must exist (translator has run) and not already
  // approved — otherwise the call is a no-op or a race.
  if (!turn.translation || turn.translation.approved === true) {
    throw new HttpsError(
      'failed-precondition',
      'No active translation to decide on.',
    );
  }

  const result = await applyDecision(sessionId, turn, draft, decision);

  // E3 — feedback capture. Fire-and-forget so the user response isn't
  // blocked on a telemetry write. Writes hashed input/output + the
  // decision so we can compute acceptance rates per prompt version.
  void recordTranslatorFeedback({
    decision,
    prompt_version: turn.translation?.prompt_version ?? 'unknown',
    moderator_tier: turn.translation?.moderator_tier ?? null,
    raw_text: draft.raw ?? '',
    softened_text: turn.translation?.softened ?? '',
    session_id: sessionId,
    speaker_uid: uid,
  }).catch((e) =>
    logger.warn('translator feedback write failed', {
      message: e instanceof Error ? e.message : String(e),
    }),
  );

  return result;
});

async function applyDecision(
  sessionId: string,
  turn: CurrentTurn,
  draft: SpeakerDraft,
  decision: TranslationDecision,
): Promise<{ ok: true }> {
  const db = getDatabase();
  const now = Date.now();

  if (decision === 'edit') {
    // Clear translation + revert commit. Speaker UI returns to compose.
    // speaker_draft lives at the session level now (sibling of
    // current_turn) so use a multi-path update spanning both.
    await db.ref(`sessions/${sessionId}`).update({
      'current_turn/translation': null,
      'speaker_draft/committed': false,
    });
    logger.info('decideTranslation: edit', { session_id: sessionId });
    return { ok: true };
  }

  const text =
    decision === 'send_softened' ? turn.translation?.softened : draft.raw;

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new HttpsError(
      'failed-precondition',
      `No ${decision === 'send_softened' ? 'softened' : 'original'} text to deliver.`,
    );
  }

  // Atomic delivery: write delivered, mark translation approved,
  // record which version was sent.
  await db.ref(`sessions/${sessionId}/current_turn`).update({
    'delivered/text': text,
    'delivered/delivered_at': now,
    'delivered/version': decision === 'send_softened' ? 'softened' : 'original',
    'translation/approved': true,
  });

  logger.info('decideTranslation delivered', {
    session_id: sessionId,
    decision,
    length: text.length,
  });
  return { ok: true };
}
