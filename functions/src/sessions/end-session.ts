import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface RequestSessionEndRequest {
  session_id?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
}

// docs/06: FLOOR_SWAP → WRAP_UP requires "both partners agree session
// is done." Same per-partner ack pattern as ackFloorSwap. When both
// have requested end, transition to WRAP_UP — the wrap-up trigger
// then generates summaries asynchronously so this callable returns
// quickly to the second-acker.
//
// Same benign race as ackFloorSwap: both clients may compute "both
// ack'd" simultaneously. The second update is a no-op overwrite.
export const requestSessionEnd = onCall<
  RequestSessionEndRequest,
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

  // FLOOR_SWAP is the spec'd entry to WRAP_UP per docs/06. We don't
  // allow ending mid-IN_TURN — partners should reach a natural break
  // (i.e. floor swap) first.
  if (meta.state !== 'FLOOR_SWAP') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot end session from state ${meta.state}. Reach the floor-swap screen first.`,
    );
  }

  await db.ref(`sessions/${sessionId}/current_turn/end_acks/${uid}`).set(true);

  const acksSnap = await db
    .ref(`sessions/${sessionId}/current_turn/end_acks`)
    .get();
  const acks = (acksSnap.val() as Record<string, boolean> | null) ?? {};
  const partnerAUid = meta.partnerA;
  const partnerBUid = meta.partnerB;
  const bothAcked =
    !!partnerAUid &&
    !!partnerBUid &&
    acks[partnerAUid] === true &&
    acks[partnerBUid] === true;

  if (bothAcked) {
    // Clear current_turn entirely on the way out — there's no more
    // turn-shaped activity, and WRAP_UP screens read from /summary
    // and /history. The wrap-up trigger fires on the meta/state
    // change and writes summaries when Claude returns.
    await db.ref(`sessions/${sessionId}`).update({
      'meta/state': 'WRAP_UP',
      current_turn: null,
    });
    logger.info('FLOOR_SWAP → WRAP_UP (both partners requested end)', {
      session_id: sessionId,
    });
  } else {
    logger.info('requestSessionEnd recorded one partner', {
      session_id: sessionId,
      uid_prefix: uid.slice(0, 8),
    });
  }

  return { ok: true, both_acked: bothAcked };
});
