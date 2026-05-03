import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { updateBaseline } from '../moderator/baseline-utils';
import type { SpeakerBaseline } from '../moderator/score';

interface ArchivedTurn {
  speaker_uid?: string;
  delivered_text?: string;
  confirmation_status?: 'heard' | 'more' | 'retry';
}

// Fires whenever a new turn lands in /sessions/{sid}/history. Updates
// the speaker's rolling baseline so the moderator fast-path can detect
// activation deltas on the speaker's *next* turn.
//
// docs/05 § Speaker baseline tracking + docs/10 § Activation markers.
//
// Acts only on the create transition (before === null); update
// transitions are no-ops because history is append-only per docs/03 —
// guards against re-fires from a partial write.
export const onHistoryWritten = onValueWritten(
  '/sessions/{sessionId}/history/{turnId}',
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val() as ArchivedTurn | null;
    if (before !== null) return;
    if (!after) return;

    const speakerUid = after.speaker_uid;
    const deliveredText = after.delivered_text;
    if (!speakerUid || typeof deliveredText !== 'string') {
      logger.warn('history-trigger: missing speaker_uid or delivered_text', {
        session_id: event.params.sessionId,
        turn_id: event.params.turnId,
      });
      return;
    }

    const db = getDatabase();
    const baselineSnap = await db.ref(`users/${speakerUid}/baseline`).get();
    const prev =
      (baselineSnap.val() as SpeakerBaseline | null | undefined) ?? null;
    const next = updateBaseline(prev, deliveredText);

    await db.ref(`users/${speakerUid}/baseline`).set(next);
    logger.info('baseline updated', {
      uid_prefix: speakerUid.slice(0, 8),
      sample_count: next.sample_count,
    });
  },
);
