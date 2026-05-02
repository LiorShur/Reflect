import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export type SessionState =
  | 'INIT'
  | 'CHECK_IN'
  | 'TOPIC_INTAKE'
  | 'TOPIC_AGREE'
  | 'IN_TURN'
  | 'FLOOR_SWAP'
  | 'PAUSED'
  | 'WRAP_UP'
  | 'ENDED';

export interface SessionMeta {
  partnerA: string;
  partnerB: string;
  raiser_uid: string;
  state: SessionState;
  topic?: string;
  paused_until?: number;
  pause_reason?: string;
  pause_requested_by?: string;
  state_before_pause?: SessionState;
  resume_acks?: Record<string, boolean>;
  // Set by the orchestrator while in CHECK_IN so each client can
  // render a partner-aware ready/waiting view without reading the
  // other partner's checkin record.
  partnerA_ready?: boolean;
  partnerB_ready?: boolean;
}

export type SessionStateView =
  | { ready: false }
  | { ready: true; meta: null }
  | { ready: true; meta: SessionMeta };

export function useSession(sessionId: string | null): SessionStateView {
  const [state, setState] = useState<SessionStateView>({ ready: false });

  useEffect(() => {
    if (!sessionId) {
      setState({ ready: true, meta: null });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, meta: null });
      return;
    }
    const r = ref(fb.database, `sessions/${sessionId}/meta`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as SessionMeta | null;
      setState({ ready: true, meta: val });
    };
    // Permission errors fire here when the session's partner uids
    // don't match auth.uid (e.g., the meta was deleted server-side
    // and the rule can no longer evaluate). Without this callback,
    // onValue swallows the error and state stays at { ready: false },
    // showing a permanent loader. Treat any read failure as
    // "session is gone" so the UI can route home.
    const errorHandler = () => {
      setState({ ready: true, meta: null });
    };
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId]);

  return state;
}

// Subscribes to /sessions/{sid}/presence/{partnerUid}/online so Home
// can detect when the partner has entered the session screen and
// auto-flip the current device into the session too. SessionScreen
// is responsible for writing the presence flag for the local user.
export function usePartnerSessionPresence(
  sessionId: string | null,
  partnerUid: string | null,
): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!sessionId || !partnerUid) {
      setOnline(false);
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setOnline(false);
      return;
    }
    const r = ref(
      fb.database,
      `sessions/${sessionId}/presence/${partnerUid}/online`,
    );
    const handler = (snap: { val: () => unknown }) => {
      setOnline(snap.val() === true);
    };
    const errorHandler = () => setOnline(false);
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId, partnerUid]);

  return online;
}

// Subscribes to users/{uid}/profile/active_session_id so the Home
// screen can route into a freshly-created session immediately and out
// of an ENDED one.
export function useActiveSessionId(uid: string | null): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSessionId(null);
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setSessionId(null);
      return;
    }
    const r = ref(fb.database, `users/${uid}/profile/active_session_id`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val();
      setSessionId(typeof val === 'string' ? val : null);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  }, [uid]);

  return sessionId;
}
