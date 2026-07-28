import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

// /sessions/{sid}/speaker_draft is private to the speaker (role-only
// .read in security rules). Subscribe only when the current user
// is the speaker; otherwise the read would be denied. Pass
// `enabled=false` for the listener role to skip the subscription.
export interface SpeakerDraft {
  raw?: string;
  committed?: boolean;
  submitted_at?: number;
}

export type SpeakerDraftView =
  { ready: false } | { ready: true; draft: SpeakerDraft | null };

export function useSpeakerDraft(
  sessionId: string | null,
  enabled: boolean,
): SpeakerDraftView {
  const [state, setState] = useState<SpeakerDraftView>({ ready: false });

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
    const r = ref(fb.database, `sessions/${sessionId}/speaker_draft`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as SpeakerDraft | null;
      setState({ ready: true, draft: val });
    };
    const errorHandler = () => setState({ ready: true, draft: null });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId, enabled]);

  return state;
}
