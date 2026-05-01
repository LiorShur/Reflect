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
    onValue(r, handler);
    return () => off(r, 'value', handler);
  }, [sessionId]);

  return state;
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
