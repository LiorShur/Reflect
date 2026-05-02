import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SessionState } from '../orchestrator/state-machine';

interface ResumeFromPauseRequest {
  session_id?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: SessionState;
  state_before_pause?: SessionState;
  paused_until?: number;
  resume_acks?: Record<string, boolean>;
}

// Per-partner resume ack. Both partners must tap to come back from
// PAUSED. The 20-min timer in UI is informational; the formal gate is
// "both partners agreed to resume." This matches docs/04's "Skip the
// wait" override — both partners tapping serves the same purpose.
//
// Restores meta/state to state_before_pause when both have ack'd.
// Per docs/06 the formal resume requires a fresh check-in score ≤ 7
// from each; that re-check flow is deferred to the follow-up that
// adds mid-session check-ins. For now, two explicit consent taps is
// the gate.
export const resumeFromPause = onCall<
  ResumeFromPauseRequest,
  Promise<{ ok: true; both_acked: boolean }>
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

  if (meta.state !== 'PAUSED') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot resume from state ${meta.state}.`,
    );
  }

  await db.ref(`sessions/${sessionId}/meta/resume_acks/${uid}`).set(true);

  const acksSnap = await db.ref(`sessions/${sessionId}/meta/resume_acks`).get();
  const acks = (acksSnap.val() as Record<string, boolean> | null) ?? {};
  const partnerAUid = meta.partnerA;
  const partnerBUid = meta.partnerB;
  const bothAcked =
    !!partnerAUid &&
    !!partnerBUid &&
    acks[partnerAUid] === true &&
    acks[partnerBUid] === true;

  if (bothAcked) {
    const restoreTo: SessionState = meta.state_before_pause ?? 'CHECK_IN';
    await db.ref(`sessions/${sessionId}/meta`).update({
      state: restoreTo,
      paused_until: null,
      state_before_pause: null,
      pause_reason: null,
      pause_requested_by: null,
      resume_acks: null,
    });
    logger.info('PAUSED → resumed', {
      session_id: sessionId,
      restored_to: restoreTo,
    });
  } else {
    logger.info('resumeFromPause recorded one partner', {
      session_id: sessionId,
      uid_prefix: uid.slice(0, 8),
    });
  }

  return { ok: true, both_acked: bothAcked };
});
