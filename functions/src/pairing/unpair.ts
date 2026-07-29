import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface UserProfile {
  partner_uid?: string;
  active_session_id?: string;
}

// Unpair the caller from their current partner. Multi-path update
// nulls partner_uid + paired_at + active_session_id on BOTH sides so
// the partner isn't left with a dangling pointer or auto-resume into
// a session whose participant is no longer joinable.
//
// If either partner still has an active_session_id after the write,
// the next session interaction lands on StaleSessionView and routes
// home — but we clear both pointers here to avoid that entirely.
//
// Idempotent: if the caller is already unpaired, the update is a
// no-op and returns ok. Modelled on the unpair block in
// deleteUserData so both flows stay consistent.
export const unpair = onCall<Record<string, never>, Promise<{ ok: true }>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const db = getDatabase();
    const profileSnap = await db.ref(`users/${uid}/profile`).get();
    const profile = (profileSnap.val() as UserProfile | null) ?? {};
    const partnerUid = profile.partner_uid;

    if (!partnerUid) {
      // Already unpaired — return ok so the client can flip UI state
      // whether the write actually happened or not.
      logger.info('unpair: no-op, caller has no partner', {
        uid_prefix: uid.slice(0, 8),
      });
      return { ok: true };
    }

    const multi: Record<string, unknown> = {
      [`users/${uid}/profile/partner_uid`]: null,
      [`users/${uid}/profile/paired_at`]: null,
      [`users/${uid}/profile/active_session_id`]: null,
      [`users/${partnerUid}/profile/partner_uid`]: null,
      [`users/${partnerUid}/profile/paired_at`]: null,
      [`users/${partnerUid}/profile/active_session_id`]: null,
    };
    await db.ref().update(multi);

    logger.info('unpair completed', {
      uid_prefix: uid.slice(0, 8),
      partner_uid_prefix: partnerUid.slice(0, 8),
    });
    return { ok: true };
  },
);
