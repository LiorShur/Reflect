import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { SessionState } from '../orchestrator/state-machine';
import { canProposeTopic, canRespondToTopic } from './session-utils';

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  raiser_uid?: string;
  state?: SessionState;
  topic?: string;
}

interface ProposeTopicRequest {
  session_id?: unknown;
  topic?: unknown;
}

interface AcceptOrReframeRequest {
  session_id?: unknown;
}

const MAX_TOPIC_LENGTH = 500;

function validateTopic(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Topic must be a string.');
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new HttpsError('invalid-argument', 'Topic must not be empty.');
  }
  if (trimmed.length > MAX_TOPIC_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Topic must be ${MAX_TOPIC_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

function validateSessionId(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new HttpsError('invalid-argument', 'session_id is required.');
  }
  return input;
}

async function loadMeta(sessionId: string): Promise<SessionMeta> {
  const snap = await getDatabase().ref(`sessions/${sessionId}/meta`).get();
  if (!snap.exists()) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  return (snap.val() as SessionMeta | null) ?? {};
}

function assertParticipant(meta: SessionMeta, uid: string): void {
  if (meta.partnerA !== uid && meta.partnerB !== uid) {
    throw new HttpsError(
      'permission-denied',
      'You are not a participant in this session.',
    );
  }
}

// Raiser proposes the topic. State must be TOPIC_INTAKE; advances to
// TOPIC_AGREE so the partner can accept or reframe.
export const proposeTopic = onCall<ProposeTopicRequest, Promise<{ ok: true }>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const sessionId = validateSessionId(request.data?.session_id);
    const topic = validateTopic(request.data?.topic);

    const meta = await loadMeta(sessionId);
    assertParticipant(meta, uid);

    if (meta.raiser_uid !== uid) {
      throw new HttpsError(
        'permission-denied',
        'Only the partner who started the session can propose the topic.',
      );
    }
    if (!canProposeTopic(meta.state)) {
      throw new HttpsError(
        'failed-precondition',
        `Cannot propose a topic from state ${meta.state}.`,
      );
    }

    await getDatabase()
      .ref(`sessions/${sessionId}/meta`)
      .update({ topic, state: 'TOPIC_AGREE' });

    logger.info('proposeTopic accepted', {
      session_id: sessionId,
      raiser_prefix: uid.slice(0, 8),
      topic_length: topic.length,
    });
    return { ok: true };
  },
);

// Responder (the non-raiser) accepts the proposed topic; advances the
// session into IN_TURN with the raiser as the first speaker. Speaker
// rotation in subsequent turns happens via floor-swap (M3d).
export const acceptTopic = onCall<
  AcceptOrReframeRequest,
  Promise<{ ok: true }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const sessionId = validateSessionId(request.data?.session_id);
  const meta = await loadMeta(sessionId);
  assertParticipant(meta, uid);

  if (meta.raiser_uid === uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the responding partner can accept the topic.',
    );
  }
  if (!canRespondToTopic(meta.state)) {
    throw new HttpsError(
      'failed-precondition',
      `Cannot respond to a topic from state ${meta.state}.`,
    );
  }

  const speakerUid = meta.raiser_uid;
  const listenerUid = uid;
  if (!speakerUid) {
    throw new HttpsError(
      'internal',
      'Session missing raiser_uid; cannot start turn.',
    );
  }

  await getDatabase().ref(`sessions/${sessionId}`).update({
    'meta/state': 'IN_TURN',
    'current_turn/speaker_uid': speakerUid,
    'current_turn/listener_uid': listenerUid,
  });

  logger.info('acceptTopic accepted', {
    session_id: sessionId,
    speaker_prefix: speakerUid.slice(0, 8),
  });
  return { ok: true };
});

// Responder asks the raiser to reframe; advances back to TOPIC_INTAKE
// so the raiser can re-propose. Topic is cleared so the raiser sees a
// blank input.
export const reframeTopic = onCall<
  AcceptOrReframeRequest,
  Promise<{ ok: true }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const sessionId = validateSessionId(request.data?.session_id);
  const meta = await loadMeta(sessionId);
  assertParticipant(meta, uid);

  if (meta.raiser_uid === uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the responding partner can ask to reframe the topic.',
    );
  }
  if (!canRespondToTopic(meta.state)) {
    throw new HttpsError(
      'failed-precondition',
      `Cannot ask to reframe from state ${meta.state}.`,
    );
  }

  await getDatabase()
    .ref(`sessions/${sessionId}/meta`)
    .update({ topic: null, state: 'TOPIC_INTAKE' });

  logger.info('reframeTopic accepted', {
    session_id: sessionId,
    responder_prefix: uid.slice(0, 8),
  });
  return { ok: true };
});
