import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  isValidConfirmStatus,
  planConfirmDecision,
  type ConfirmStatus,
} from './turn-utils';

interface ConfirmTurnRequest {
  session_id?: unknown;
  status?: unknown;
  hint?: unknown;
}

interface SessionMeta {
  partnerA?: string;
  partnerB?: string;
  state?: string;
  topic?: string;
}

interface DeliveredMessage {
  text?: string;
  delivered_at?: number;
  version?: 'softened' | 'original';
}

interface MirrorRecord {
  text?: string;
  submitted_at?: number;
}

interface CurrentTurn {
  speaker_uid?: string;
  listener_uid?: string;
  delivered?: DeliveredMessage;
  mirror?: MirrorRecord;
}

const MAX_HINT_LENGTH = 500;

// Speaker decides whether the listener heard them. Routes to one of:
//   'heard' (yes / mostly) → archive + swap roles → FLOOR_SWAP, with a
//                            stub floor-swap summary (literal delivered
//                            + mirror text). Real Claude-generated
//                            summary lands in M4 alongside the wrap-up
//                            summarizer (C9 / AI4).
//   'more'                 → archive the just-completed sub-turn, keep
//                            speaker, fresh compose. State stays IN_TURN.
//   'retry'                → clear mirror + listener_draft, listener
//                            re-mirrors with optional hint. State stays
//                            IN_TURN.
//
// docs/04 § Speaker confirmation + docs/06 § Floor token rotation.
export const confirmTurn = onCall<
  ConfirmTurnRequest,
  Promise<{ ok: true; status: ConfirmStatus }>
>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const sessionId = request.data?.session_id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new HttpsError('invalid-argument', 'session_id is required.');
  }

  const status = request.data?.status;
  if (!isValidConfirmStatus(status)) {
    throw new HttpsError(
      'invalid-argument',
      "status must be 'heard' | 'more' | 'retry'.",
    );
  }

  const hintRaw = request.data?.hint;
  const hint = sanitizeHint(hintRaw);

  const db = getDatabase();
  const [metaSnap, turnSnap] = await Promise.all([
    db.ref(`sessions/${sessionId}/meta`).get(),
    db.ref(`sessions/${sessionId}/current_turn`).get(),
  ]);

  if (!metaSnap.exists()) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  const meta = (metaSnap.val() as SessionMeta | null) ?? {};
  const turn = (turnSnap.val() as CurrentTurn | null) ?? {};

  if (turn.speaker_uid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the current speaker can confirm a turn.',
    );
  }

  if (meta.state !== 'IN_TURN') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot confirm a turn from state ${meta.state}.`,
    );
  }

  const mirrorText = turn.mirror?.text;
  if (typeof mirrorText !== 'string' || mirrorText.trim().length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No mirror to confirm yet — the listener has not reflected back.',
    );
  }

  const deliveredText = turn.delivered?.text;
  if (typeof deliveredText !== 'string' || deliveredText.trim().length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Turn is missing a delivered message.',
    );
  }

  const plan = planConfirmDecision(status);
  const speakerUid = turn.speaker_uid as string;
  const listenerUid = turn.listener_uid as string;
  if (!listenerUid) {
    throw new HttpsError('internal', 'Turn missing listener_uid.');
  }
  const now = Date.now();

  // Build a single multi-path update so the transition is atomic.
  const update: Record<string, unknown> = {};

  if (plan.archiveTurn) {
    const turnId = `${now}_${Math.random().toString(36).slice(2, 8)}`;
    // docs/03 § history: append-only record of speaker_uid, listener_uid,
    // delivered_text, mirror_text, confirmation_status, timestamps.
    // Keep it minimal — wrap-up summarizer reads from here.
    update[`history/${turnId}`] = {
      speaker_uid: speakerUid,
      listener_uid: listenerUid,
      topic: meta.topic ?? null,
      delivered_text: deliveredText,
      mirror_text: mirrorText,
      confirmation_status: status,
      hint: hint ?? null,
      archived_at: now,
    };
  }

  if (plan.newState === 'FLOOR_SWAP') {
    // Reset current_turn entirely with swapped roles. Stub summary is
    // the literal delivered + mirror text; M4 will replace with a
    // Claude-generated condensation.
    update['meta/state'] = 'FLOOR_SWAP';
    update['current_turn'] = {
      speaker_uid: listenerUid,
      listener_uid: speakerUid,
      floor_swap_summary: {
        prev_speaker_uid: speakerUid,
        prev_listener_uid: listenerUid,
        delivered_text: deliveredText,
        mirror_text: mirrorText,
        created_at: now,
      },
      swap_acks: null,
    };
  } else if (plan.clearMirrorOnly) {
    // 'retry' — listener re-mirrors. Preserve delivered + speaker_uid +
    // listener_uid; clear mirror, listener_draft, and any prior
    // confirmation. Optional hint surfaces in the listener's UI.
    update['current_turn/mirror'] = null;
    update['current_turn/listener_draft'] = null;
    update['current_turn/speaker_confirmation'] = null;
    update['current_turn/retry_hint'] = hint ?? null;
  } else {
    // 'more' — same speaker keeps floor with a fresh compose. Clear
    // everything turn-content-shaped; preserve speaker_uid /
    // listener_uid.
    update['current_turn/speaker_draft'] = null;
    update['current_turn/translation'] = null;
    update['current_turn/delivered'] = null;
    update['current_turn/listener_draft'] = null;
    update['current_turn/mirror'] = null;
    update['current_turn/speaker_confirmation'] = null;
    update['current_turn/retry_hint'] = null;
  }

  await db.ref(`sessions/${sessionId}`).update(update);

  logger.info('confirmTurn applied', {
    session_id: sessionId,
    status,
    archived: plan.archiveTurn,
    new_state: plan.newState,
  });

  return { ok: true, status };
});

function sanitizeHint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_HINT_LENGTH);
}
