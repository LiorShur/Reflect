import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isValidDecision, type TranslationDecision } from './turn-utils';

interface DecideTranslationRequest {
  session_id?: unknown;
  decision?: unknown;
}

interface CurrentTurn {
  speaker_uid?: string;
  speaker_draft?: { raw?: string; committed?: boolean };
  translation?: { softened?: string; approved?: boolean };
}

// Speaker decides what to do with the translator's output:
//   'send_softened' → softened text becomes delivered.text
//   'send_original' → speaker_draft.raw becomes delivered.text
//   'edit'          → translation cleared, speaker_draft.committed
//                     reset to false so speaker returns to compose
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
  const turnSnap = await db.ref(`sessions/${sessionId}/current_turn`).get();
  if (!turnSnap.exists()) {
    throw new HttpsError('not-found', 'Session has no current turn.');
  }
  const turn = (turnSnap.val() as CurrentTurn | null) ?? {};

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

  return await applyDecision(sessionId, turn, decision);
});

async function applyDecision(
  sessionId: string,
  turn: CurrentTurn,
  decision: TranslationDecision,
): Promise<{ ok: true }> {
  const db = getDatabase();
  const now = Date.now();

  if (decision === 'edit') {
    // Clear translation + revert commit. Speaker UI returns to compose.
    await db.ref(`sessions/${sessionId}/current_turn`).update({
      translation: null,
      'speaker_draft/committed': false,
    });
    logger.info('decideTranslation: edit', { session_id: sessionId });
    return { ok: true };
  }

  const text =
    decision === 'send_softened'
      ? turn.translation?.softened
      : turn.speaker_draft?.raw;

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
