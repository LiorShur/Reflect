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
  const now = Date.now();

  const myPartnerSnap = await db.ref(`users/${uid}/profile/partner_uid`).get();
  if (myPartnerSnap.exists()) {
    throw new HttpsError('failed-precondition', 'You are already paired.');
  }

  // Definitive server read. We previously used .transaction() here for
  // race-safety, but admin SDK's transaction handler is invoked with the
  // local cache value first (null on cold instances) and our abort-on-
  // null logic returned `undefined`, terminating the transaction before
  // the server view was consulted. Documented behavior:
  // https://firebase.google.com/docs/database/admin/save-data#section-transactions
  const codeSnap = await db.ref(`pair_codes/${code}`).once('value');
  if (!codeSnap.exists()) {
    throw new HttpsError(
      'not-found',
      'No active code with that number. Ask your partner to generate a new one.',
    );
  }
  const codeData = codeSnap.val() as PairCodeRecord;
  if (isExpired(codeData.expires_at, now)) {
    throw new HttpsError(
      'deadline-exceeded',
      'That code has expired. Ask your partner to generate a new one.',
    );
  }
  if (wouldSelfPair(codeData.creator_uid, uid)) {
    throw new HttpsError(
      'failed-precondition',
      "That's your own code. Enter your partner's code instead.",
    );
  }

  const claimedCreator = codeData.creator_uid;

  // Race-safe binding: transaction on the creator's partner_uid.
  // Concurrent redeemers race here — only the first one wins because
  // any subsequent transaction sees a non-null `current` and aborts.
  // The cache-quirk above doesn't bite us here: on the first call
  // current is null, we return uid (bind), SDK attempts write; if the
  // server is also null, the write succeeds. If another redeemer beat
  // us, the server has their uid, the write conflicts, and the retry
  // handler sees the real value and correctly aborts.
  const creatorPartnerRef = db.ref(
    `users/${claimedCreator}/profile/partner_uid`,
  );
  const bindResult = await creatorPartnerRef.transaction(
    (current: string | null) => {
      if (current !== null) return; // already paired — abort
      return uid;
    },
  );

  if (!bindResult.committed) {
    throw new HttpsError(
      'failed-precondition',
      'The other user is already paired.',
    );
  }

  // Bind succeeded. Set the rest of the binding plus delete the code,
  // atomically across paths so readers see a consistent state.
  await db.ref().update({
    [`users/${uid}/profile/partner_uid`]: claimedCreator,
    [`users/${uid}/profile/paired_at`]: now,
    [`users/${claimedCreator}/profile/paired_at`]: now,
    [`pair_codes/${code}`]: null,
  });

  return { partner_uid: claimedCreator };
});
