import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { computeTier, QUESTION_IDS } from './tier-rules';

interface SubmitScreeningRequest {
  answers?: unknown;
}

interface SubmitScreeningResponse {
  tier: 'low' | 'moderate' | 'high';
}

function validateAnswers(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'answers must be an object.');
  }
  const obj = input as Record<string, unknown>;
  const answers: Record<string, number> = {};
  for (const id of QUESTION_IDS) {
    const v = obj[id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 4) {
      throw new HttpsError(
        'invalid-argument',
        `Answer for ${id} must be an integer 0-4.`,
      );
    }
    answers[id] = v;
  }
  return answers;
}

export const submitScreening = onCall<
  SubmitScreeningRequest,
  Promise<SubmitScreeningResponse>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const answers = validateAnswers(request.data?.answers);

  const db = getDatabase();
  const now = Date.now();

  // Screening must complete before pairing — partner's screen needs
  // to be done on their own device too. CLAUDE.md safety rail #4.
  const partnerSnap = await db.ref(`users/${uid}/profile/partner_uid`).get();
  if (partnerSnap.exists()) {
    throw new HttpsError(
      'failed-precondition',
      'Cannot re-submit screening while paired. Unpair first.',
    );
  }

  const { tier, flags } = computeTier(answers);

  // Raw answers are deliberately not persisted (docs/07 § Privacy).
  await db.ref(`users/${uid}/screening`).set({
    completed_at: now,
    tier,
    flags,
  });

  return { tier };
});
