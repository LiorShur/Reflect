import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';

import { bothPartnersConfirmedWrapUp } from './wrap-up-utils';

interface SessionMeta {
  state?: string;
}

interface SummaryNode {
  partner_a_confirmed?: unknown;
  partner_b_confirmed?: unknown;
}

// Fires whenever either partner's wrap-up confirm flag is written.
// Direct RTDB writes are allowed by the existing security rules
// (each partner can only write their own confirmation flag).
//
// docs/06: WRAP_UP → ENDED iff "both partners confirm summaries".
export const onWrapUpConfirmWritten = onValueWritten(
  '/sessions/{sessionId}/summary/{field}',
  async (event) => {
    const field = event.params.field;
    if (field !== 'partner_a_confirmed' && field !== 'partner_b_confirmed') {
      return;
    }

    const sessionId = event.params.sessionId;
    const db = getDatabase();
    const metaSnap = await db.ref(`sessions/${sessionId}/meta`).get();
    if (!metaSnap.exists()) return;
    const meta = (metaSnap.val() as SessionMeta | null) ?? {};

    // Only act in WRAP_UP. A confirm write outside WRAP_UP is either
    // stale or out-of-flow — ignore.
    if (meta.state !== 'WRAP_UP') return;

    const summarySnap = await db.ref(`sessions/${sessionId}/summary`).get();
    const summary = (summarySnap.val() as SummaryNode | null) ?? {};

    if (!bothPartnersConfirmedWrapUp(summary)) return;

    await db.ref(`sessions/${sessionId}/meta/state`).set('ENDED');
    logger.info('WRAP_UP → ENDED (both partners confirmed)', {
      session_id: sessionId,
    });
  },
);
