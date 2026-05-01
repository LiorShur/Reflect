import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface ClearStaleSessionRequest {
  session_id?: unknown;
}

interface ProfileRecord {
  partner_uid?: string;
  active_session_id?: string;
}

interface SessionMeta {
  state?: string;
}

// Clears users/{uid}/profile/active_session_id (and the partner's, if
// they're pointing at the same session) when the session it references
// no longer exists or has reached ENDED.
//
// Called by the mobile client when SessionScreen lands on a session
// whose meta is missing — typically because a developer cleared the
// sessions tree manually, or because the session ENDED and the
// pointer wasn't cleaned up. Refuses to clear pointers that still
// reference an active session, so a misbehaving client can't unstick
// itself out of a real conversation.
export const clearStaleSession = onCall<
  ClearStaleSessionRequest,
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

  const db = getDatabase();

  const metaSnap = await db.ref(`sessions/${sessionId}/meta`).get();
  if (metaSnap.exists()) {
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};
    if (meta.state !== 'ENDED') {
      throw new HttpsError(
        'failed-precondition',
        'Session is still active — cannot clear.',
      );
    }
  }

  const profileSnap = await db.ref(`users/${uid}/profile`).get();
  const profile = (profileSnap.val() as ProfileRecord | null) ?? {};

  const updates: Record<string, null> = {};
  if (profile.active_session_id === sessionId) {
    updates[`users/${uid}/profile/active_session_id`] = null;
  }
  if (profile.partner_uid) {
    const partnerSnap = await db
      .ref(`users/${profile.partner_uid}/profile`)
      .get();
    const partner = (partnerSnap.val() as ProfileRecord | null) ?? {};
    if (partner.active_session_id === sessionId) {
      updates[`users/${profile.partner_uid}/profile/active_session_id`] = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    logger.info('clearStaleSession cleared pointers', {
      session_id: sessionId,
      uid_prefix: uid.slice(0, 8),
      cleared_paths: Object.keys(updates).length,
    });
  }

  return { ok: true };
});
