import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  mode?: string;
}

// Fires whenever a session's meta/state changes. Acts only on the
// transition INTO ENDED for conflict-mode sessions — that's the
// signal R5 needs: writes users/{uid}/profile/last_conflict_at for
// both partners so Home can suppress the daily-appreciation prompt
// for ~4 hours after a fight (forced appreciation right after
// conflict feels false per docs/04 § Daily appreciation).
//
// Only conflict-mode sessions count. Friendship-layer mini-sessions
// (e.g. shared appreciation rituals) shouldn't trip the suppression.
export const onSessionEnded = onValueWritten(
  '/sessions/{sessionId}/meta/state',
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (after !== 'ENDED' || before === 'ENDED') return;

    const sessionId = event.params.sessionId;
    const db = getDatabase();
    const metaSnap = await db.ref(`sessions/${sessionId}/meta`).get();
    if (!metaSnap.exists()) return;
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};

    if (meta.mode && meta.mode !== 'conflict') return;
    if (!meta.partnerA || !meta.partnerB) {
      logger.warn('onSessionEnded: missing partner uids', {
        session_id: sessionId,
      });
      return;
    }

    const now = Date.now();
    await db.ref().update({
      [`users/${meta.partnerA}/profile/last_conflict_at`]: now,
      [`users/${meta.partnerB}/profile/last_conflict_at`]: now,
    });
    logger.info('last_conflict_at written for both partners', {
      session_id: sessionId,
    });
  },
);
