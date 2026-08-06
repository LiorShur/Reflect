import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';
import type { ListenerDraft } from './use-current-turn';

// /sessions/{sid}/listener_draft is private to the listener (role-
// only .read in security rules). Subscribe only when the current
// user is the listener; otherwise the read would be denied.
// Pass `enabled=false` for the speaker role to skip the subscription.
export type ListenerDraftView =
  { ready: false } | { ready: true; draft: ListenerDraft | null };

export function useListenerDraft(
  sessionId: string | null,
  enabled: boolean,
): ListenerDraftView {
  const [state, setState] = useState<ListenerDraftView>({ ready: false });

  useEffect(() => {
    if (!sessionId || !enabled) {
      setState({ ready: true, draft: null });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, draft: null });
      return;
    }
    const r = ref(fb.database, `sessions/${sessionId}/listener_draft`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as ListenerDraft | null;
      setState({ ready: true, draft: val });
    };
    const errorHandler = () => setState({ ready: true, draft: null });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId, enabled]);

  return state;
}
