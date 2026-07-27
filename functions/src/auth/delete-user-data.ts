import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

interface UserProfile {
  partner_uid?: string;
  active_session_id?: string;
}

// A1 — account deletion. Called from Settings after the user
// re-authenticates (Firebase Auth requires a recent sign-in for
// destructive account operations, and re-auth is enforced client-
// side in delete-account flow).
//
// Order matters:
//   1. Unpair partner if any — nulls partner_uid + paired_at on the
//      OTHER partner's profile so they aren't left dangling.
//   2. Clear any active_session_id so the partner's Home doesn't try
//      to auto-route into a session whose participant is gone.
//   3. Delete users/{uid} subtree entirely (profile, screening,
//      baseline, settings).
//   4. Delete the Firebase Auth user — signs the caller out on their
//      next token refresh (client sees onAuthStateChanged → null).
//
// If step 4 fails, the auth user survives but their RTDB record is
// gone. Client-side wrapper can retry step 4 explicitly (this
// callable is idempotent — repeat calls after step 3 no-op on
// missing profile).
export const deleteUserData = onCall<
  Record<string, never>,
  Promise<{ ok: true }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const db = getDatabase();
  const profileSnap = await db.ref(`users/${uid}/profile`).get();
  const profile = (profileSnap.val() as UserProfile | null) ?? {};

  // 1 + 2: unpair the partner (if any) so they don't see a dangling
  // partner_uid pointing at a deleted account, and clear both sides'
  // active_session_id. Do these as a single multi-path update so we
  // can't leave the partner in a half-migrated state.
  const partnerUid = profile.partner_uid;
  const multi: Record<string, unknown> = {
    [`users/${uid}`]: null,
  };
  if (partnerUid) {
    multi[`users/${partnerUid}/profile/partner_uid`] = null;
    multi[`users/${partnerUid}/profile/paired_at`] = null;
    multi[`users/${partnerUid}/profile/active_session_id`] = null;
  }
  await db.ref().update(multi);

  // 4: delete the Auth user. Requires the Cloud Functions service
  // account to have the Firebase Authentication Admin role (default
  // for functions in most projects).
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    // RTDB is already cleaned; just log the auth-side failure so it
    // can be manually retried. Rethrow so the client knows to prompt
    // the user.
    logger.error('deleteUserData: auth deletion failed', {
      uid_prefix: uid.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
    });
    throw new HttpsError(
      'internal',
      'Your data was removed but the account itself could not be deleted. Please contact support.',
    );
  }

  logger.info('deleteUserData completed', {
    uid_prefix: uid.slice(0, 8),
    unpaired_partner: !!partnerUid,
  });
  return { ok: true };
});
