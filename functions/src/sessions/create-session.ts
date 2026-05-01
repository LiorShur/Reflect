import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { canCreateConflictSession, type Tier } from './session-utils';

interface CreateSessionRequest {
  mode?: unknown;
}

interface CreateSessionResponse {
  session_id: string;
}

interface ScreeningRecord {
  tier?: Tier;
  completed_at?: number;
}

interface ProfileRecord {
  partner_uid?: string;
  active_session_id?: string;
}

export const createSession = onCall<
  CreateSessionRequest,
  Promise<CreateSessionResponse>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const mode = request.data?.mode;
  // v1 only ships conflict mode; friendship rituals (M5) and
  // stress-reducing conversation (v2) come later.
  if (mode !== 'conflict') {
    throw new HttpsError(
      'invalid-argument',
      `Unsupported session mode: ${String(mode)}`,
    );
  }

  const db = getDatabase();

  // Read self profile + screening + partner profile + screening in
  // parallel. Each path is uid-scoped so admin SDK reads bypass rules
  // that would block cross-partner reads.
  const selfProfileSnap = await db.ref(`users/${uid}/profile`).get();
  const selfProfile = (selfProfileSnap.val() as ProfileRecord | null) ?? {};
  const partnerUid = selfProfile.partner_uid;
  if (!partnerUid) {
    throw new HttpsError(
      'failed-precondition',
      'You need to pair with your partner first.',
    );
  }
  if (selfProfile.active_session_id) {
    throw new HttpsError(
      'failed-precondition',
      'You already have an active session.',
    );
  }

  const [selfScreeningSnap, partnerScreeningSnap, partnerProfileSnap] =
    await Promise.all([
      db.ref(`users/${uid}/screening`).get(),
      db.ref(`users/${partnerUid}/screening`).get(),
      db.ref(`users/${partnerUid}/profile`).get(),
    ]);

  const selfScreening =
    (selfScreeningSnap.val() as ScreeningRecord | null) ?? {};
  const partnerScreening =
    (partnerScreeningSnap.val() as ScreeningRecord | null) ?? {};
  const partnerProfile =
    (partnerProfileSnap.val() as ProfileRecord | null) ?? {};

  if (partnerProfile.active_session_id) {
    throw new HttpsError(
      'failed-precondition',
      'Your partner already has an active session.',
    );
  }

  const eligibility = canCreateConflictSession({
    selfTier: selfScreening.tier ?? null,
    partnerTier: partnerScreening.tier ?? null,
  });
  if (!eligibility.ok) {
    throw new HttpsError('failed-precondition', eligibility.reason);
  }

  // Create the session. The creator is the raiser per docs/06 § Topic
  // intake — they propose the topic; the partner accepts/refines.
  // Skip the doc's INIT state since both partners are already known
  // (paired); jump straight to CHECK_IN.
  const now = Date.now();
  const sessionRef = db.ref('sessions').push();
  const sessionId = sessionRef.key;
  if (!sessionId) {
    throw new HttpsError('internal', 'Failed to allocate session id.');
  }

  await sessionRef.set({
    meta: {
      partnerA: uid,
      partnerB: partnerUid,
      raiser_uid: uid,
      mode: 'conflict',
      state: 'CHECK_IN',
      started_at: now,
      turn_count: 0,
    },
  });

  // Set active_session_id on both profiles so each device's home
  // screen can immediately route them into the session.
  await db.ref().update({
    [`users/${uid}/profile/active_session_id`]: sessionId,
    [`users/${partnerUid}/profile/active_session_id`]: sessionId,
  });

  logger.info('createSession created', {
    session_id: sessionId,
    raiser_prefix: uid.slice(0, 8),
    partner_prefix: partnerUid.slice(0, 8),
  });

  return { session_id: sessionId };
});
