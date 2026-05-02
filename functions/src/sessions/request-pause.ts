import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SessionState } from '../orchestrator/state-machine';

interface RequestPauseRequest {
  session_id?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: SessionState;
}

const PAUSE_DURATION_MS = 20 * 60 * 1000;

// States from which a manual pause is reachable. Mirrors
// ACTIVE_STATES in orchestrator/state-machine. PAUSED and ENDED are
// excluded — the former is already paused, the latter is terminal.
const PAUSABLE_STATES: ReadonlySet<SessionState> = new Set([
  'CHECK_IN',
  'TOPIC_INTAKE',
  'TOPIC_AGREE',
  'IN_TURN',
  'FLOOR_SWAP',
  'WRAP_UP',
]);

// Either partner can request a pause from any active state. docs/06
// § Pause and resume — "Either partner explicitly requests a break"
// is one of three trigger conditions; the other two (linguistic
// flooding markers, mid-session check-in) land in follow-ups.
//
// Records state_before_pause so resumeFromPause can restore it, plus
// paused_until = now + 20min as the soothing-window anchor (the UI
// counts down to that timestamp). Clears any stale resume_acks from
// a prior pause cycle.
export const requestPause = onCall<RequestPauseRequest, Promise<{ ok: true }>>(
  async (request) => {
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

    const currentState = meta.state;
    if (!currentState || !PAUSABLE_STATES.has(currentState)) {
      throw new HttpsError(
        'failed-precondition',
        `Cannot pause from state ${currentState}.`,
      );
    }

    await db.ref(`sessions/${sessionId}/meta`).update({
      state: 'PAUSED',
      state_before_pause: currentState,
      paused_until: Date.now() + PAUSE_DURATION_MS,
      pause_reason: 'manual_break',
      pause_requested_by: uid,
      resume_acks: null,
    });

    logger.info('requestPause → PAUSED', {
      session_id: sessionId,
      from_state: currentState,
      requested_by_prefix: uid.slice(0, 8),
    });

    return { ok: true };
  },
);
