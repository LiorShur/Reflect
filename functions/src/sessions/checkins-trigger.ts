import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { decideCheckInTransition, type CheckIn } from './session-utils';

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
}

// Fires whenever either partner's check-in record is written. If both
// partners are ready and below the flooding threshold, advance the
// session from CHECK_IN to TOPIC_INTAKE. If either is at the flooding
// threshold, advance to PAUSED with a server timestamp for resume.
//
// docs/06 § Transition triggers maps:
//   CHECK_IN → TOPIC_INTAKE  iff both ready, both score ≤ 7
//   CHECK_IN → PAUSED        iff either score ≥ 8
export const onCheckinWritten = onValueWritten(
  '/sessions/{sessionId}/checkins/{uid}',
  async (event) => {
    const sessionId = event.params.sessionId;
    const db = getDatabase();

    const metaSnap = await db.ref(`sessions/${sessionId}/meta`).get();
    if (!metaSnap.exists()) return;
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};

    // Only act while in CHECK_IN — otherwise the check-in record is
    // either stale (write happened during a prior CHECK_IN that
    // already transitioned) or the session is in a different phase
    // (e.g., PAUSED resume re-checks land here too in M3+ but the
    // resume is handled by a separate trigger).
    if (meta.state !== 'CHECK_IN') return;

    if (!meta.partnerA || !meta.partnerB) {
      logger.warn('onCheckinWritten missing partner uids', {
        session_id: sessionId,
      });
      return;
    }

    const [aSnap, bSnap] = await Promise.all([
      db.ref(`sessions/${sessionId}/checkins/${meta.partnerA}`).get(),
      db.ref(`sessions/${sessionId}/checkins/${meta.partnerB}`).get(),
    ]);
    const a = (aSnap.val() as CheckIn | null) ?? null;
    const b = (bSnap.val() as CheckIn | null) ?? null;

    const decision = decideCheckInTransition(a, b);
    if ('wait' in decision) return;

    if (decision.advance === 'TOPIC_INTAKE') {
      await db
        .ref(`sessions/${sessionId}/meta`)
        .update({ state: 'TOPIC_INTAKE' });
      logger.info('CHECK_IN → TOPIC_INTAKE', { session_id: sessionId });
      return;
    }

    // PAUSED
    const PAUSE_DURATION_MS = 20 * 60 * 1000;
    await db.ref(`sessions/${sessionId}/meta`).update({
      state: 'PAUSED',
      state_before_pause: 'CHECK_IN',
      paused_until: Date.now() + PAUSE_DURATION_MS,
      pause_reason: decision.reason,
    });
    logger.info('CHECK_IN → PAUSED', {
      session_id: sessionId,
      reason: decision.reason,
    });
  },
);
