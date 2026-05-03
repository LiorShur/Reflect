import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface AdjustSummaryRequest {
  session_id?: unknown;
  text?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
}

const MAX_SUMMARY_LENGTH = 2000;

// docs/04 § Wrap-up: "Each card has buttons: 'this captures it' /
// 'let me adjust'. Adjustments trigger re-summarization." For v1 we
// take the simpler interpretation — the partner directly edits their
// own summary text. The summary fields are server-only at the
// security-rules layer, so this callable is the speaker's only path
// to update them. A future iteration can layer Claude re-summarization
// on top by routing through here.
//
// Auth: must be a participant. Each partner can only edit their own
// summary (partner_a_summary if you're partnerA, partner_b_summary if
// partnerB). Editing also clears your own *_confirmed flag — you
// can't be on-record as confirming a different version of the text.
export const adjustSummary = onCall<
  AdjustSummaryRequest,
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

  const text = request.data?.text;
  if (typeof text !== 'string') {
    throw new HttpsError('invalid-argument', 'text must be a string.');
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new HttpsError('invalid-argument', 'text must not be empty.');
  }
  if (trimmed.length > MAX_SUMMARY_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `text must be ${MAX_SUMMARY_LENGTH} characters or fewer.`,
    );
  }

  const db = getDatabase();
  const metaSnap = await db.ref(`sessions/${sessionId}/meta`).get();
  if (!metaSnap.exists()) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  const meta = (metaSnap.val() as SessionMeta | null) ?? {};

  if (meta.partnerA !== uid && meta.partnerB !== uid) {
    throw new HttpsError(
      'permission-denied',
      'You are not a participant in this session.',
    );
  }
  if (meta.state !== 'WRAP_UP') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot adjust summary from state ${meta.state}.`,
    );
  }

  const summaryField =
    meta.partnerA === uid ? 'partner_a_summary' : 'partner_b_summary';
  const confirmedField =
    meta.partnerA === uid ? 'partner_a_confirmed' : 'partner_b_confirmed';

  await db.ref(`sessions/${sessionId}/summary`).update({
    [summaryField]: trimmed,
    // Clearing your own confirmation: you can't be on-record as
    // having confirmed a different version of the text.
    [confirmedField]: false,
  });

  logger.info('adjustSummary applied', {
    session_id: sessionId,
    field: summaryField,
    length: trimmed.length,
  });
  return { ok: true };
});
