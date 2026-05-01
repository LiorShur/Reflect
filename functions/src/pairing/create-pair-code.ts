import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { generateCode, PAIR_CODE_TTL_MS } from './code-utils';

interface CreatePairCodeResponse {
  code: string;
}

const MAX_GENERATION_ATTEMPTS = 10;

export const createPairCode = onCall<unknown, Promise<CreatePairCodeResponse>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const db = getDatabase();

    const partnerSnap = await db.ref(`users/${uid}/profile/partner_uid`).get();
    if (partnerSnap.exists()) {
      throw new HttpsError('failed-precondition', 'You are already paired.');
    }

    // Race-safe code allocation: transaction returns null to commit,
    // undefined to abort. We abort on collision and try again.
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generateCode();
      const now = Date.now();
      const result = await db
        .ref(`pair_codes/${code}`)
        .transaction((current) => {
          if (current !== null) return; // collision — abort
          return {
            creator_uid: uid,
            created_at: now,
            expires_at: now + PAIR_CODE_TTL_MS,
          };
        });
      if (result.committed) {
        return { code };
      }
    }

    throw new HttpsError(
      'internal',
      'Could not allocate a unique pair code; try again.',
    );
  },
);
