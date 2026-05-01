import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isExpired, isValidCodeFormat, wouldSelfPair } from './code-utils';

interface RedeemPairCodeRequest {
  code?: unknown;
}

interface RedeemPairCodeResponse {
  partner_uid: string;
}

interface PairCodeRecord {
  creator_uid: string;
  created_at: number;
  expires_at: number;
}

export const redeemPairCode = onCall<
  RedeemPairCodeRequest,
  Promise<RedeemPairCodeResponse>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const code = request.data?.code;
  if (!isValidCodeFormat(code)) {
    throw new HttpsError('invalid-argument', 'Pair codes are 6 digits.');
  }

  const db = getDatabase();

  const myPartnerSnap = await db.ref(`users/${uid}/profile/partner_uid`).get();
  if (myPartnerSnap.exists()) {
    throw new HttpsError('failed-precondition', 'You are already paired.');
  }

  // Atomically claim the code: the transaction sets the node to null
  // (which deletes it) iff the record is present, unexpired, and not
  // self-pairing. Concurrent redeemers race here; only one wins.
  let claimedCreator: string | null = null;
  const now = Date.now();
  const claim = await db
    .ref(`pair_codes/${code}`)
    .transaction((current: PairCodeRecord | null) => {
      if (current === null) return; // missing
      if (isExpired(current.expires_at, now)) return; // expired
      if (wouldSelfPair(current.creator_uid, uid)) return; // self-pair
      claimedCreator = current.creator_uid;
      return null; // delete (claim)
    });

  if (!claim.committed || claimedCreator === null) {
    throw new HttpsError(
      'not-found',
      'That code is invalid, expired, or already used.',
    );
  }

  // Defensive: creator might have been paired by another flow between
  // code creation and redemption. Refuse and surface the error rather
  // than silently overwriting their pair binding.
  const creatorPartnerSnap = await db
    .ref(`users/${claimedCreator}/profile/partner_uid`)
    .get();
  if (creatorPartnerSnap.exists()) {
    throw new HttpsError(
      'failed-precondition',
      'The other user is already paired.',
    );
  }

  // Single multi-path update so the binding is atomic across both
  // users — readers see either both partner_uids or neither.
  await db.ref().update({
    [`users/${uid}/profile/partner_uid`]: claimedCreator,
    [`users/${uid}/profile/paired_at`]: now,
    [`users/${claimedCreator}/profile/partner_uid`]: uid,
    [`users/${claimedCreator}/profile/paired_at`]: now,
  });

  return { partner_uid: claimedCreator };
});
