import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface AckFloorSwapRequest {
  session_id?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
}

// Per-partner ack of the floor swap summary. When both partners have
// ack'd, transition to IN_TURN and clear the swap summary + acks.
//
// docs/06 § Floor token rotation step 4–5: "Both partners see the swap
// summary screen with 'ready to continue' button. When both have
// acknowledged, orchestrator sets meta/state: IN_TURN."
//
// Implementation note: there's a benign race when both partners click
// ~simultaneously — both invocations may compute "both ack'd" and fire
// the IN_TURN transition. The second update is a no-op overwrite of
// the same fields, so the race is harmless.
export const ackFloorSwap = onCall<
  AckFloorSwapRequest,
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

  if (meta.state !== 'FLOOR_SWAP') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot ack floor swap from state ${meta.state}.`,
    );
  }

  await db.ref(`sessions/${sessionId}/current_turn`).update({
    [`swap_acks/${uid}`]: true,
    // Tapping "Ready to continue" is the opposite intent of
    // "End the session" — clear any stale end_ack from the same
    // partner so they can change their mind without being held to
    // a prior tap.
    [`end_acks/${uid}`]: null,
  });

  // Re-read both acks to decide whether to transition. Reading after
  // the write avoids a TOCTOU window where both clients read pre-write
  // and miss each other.
  const acksSnap = await db
    .ref(`sessions/${sessionId}/current_turn/swap_acks`)
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
    await db.ref(`sessions/${sessionId}`).update({
      'meta/state': 'IN_TURN',
      'current_turn/floor_swap_summary': null,
      'current_turn/swap_acks': null,
    });
    logger.info('ackFloorSwap both partners ack’d → IN_TURN', {
      session_id: sessionId,
    });
  } else {
    logger.info('ackFloorSwap recorded one partner', {
      session_id: sessionId,
      uid_prefix: uid.slice(0, 8),
    });
  }

  return { ok: true, both_acked: bothAcked };
});
