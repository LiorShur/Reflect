import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface SubmitFeedbackRequest {
  body?: unknown;
  app_version?: unknown;
}

const MAX_BODY_LENGTH = 4000;

// Pilot-ops: in-app "Send feedback" write path. Testers rarely email
// screenshots; a one-tap textarea → submit is the difference between
// getting signal and not.
//
// Stored at /feedback/{uid}/{push_id}. Server-only readable — the
// team reads these out-of-band (or via a future admin dashboard).
// The path is scoped to the sender's uid so they can only write their
// own feedback entries.
export const submitFeedback = onCall<
  SubmitFeedbackRequest,
  Promise<{ ok: true }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const body = request.data?.body;
  if (typeof body !== 'string') {
    throw new HttpsError('invalid-argument', 'body must be a string.');
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new HttpsError('invalid-argument', 'body must not be empty.');
  }
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `body must be ${MAX_BODY_LENGTH} characters or fewer.`,
    );
  }

  const appVersion =
    typeof request.data?.app_version === 'string'
      ? request.data.app_version.slice(0, 40)
      : null;

  await getDatabase().ref(`feedback/${uid}`).push({
    body: trimmed,
    app_version: appVersion,
    created_at: Date.now(),
  });

  logger.info('submitFeedback recorded', {
    uid_prefix: uid.slice(0, 8),
    length: trimmed.length,
  });
  return { ok: true };
});
