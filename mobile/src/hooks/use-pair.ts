import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export type PairState =
  | { ready: false }
  | { ready: true; partnerUid: string | null };

// Subscribes to users/{uid}/profile/partner_uid in RTDB so the UI
// reactively reflects "paired" / "unpaired". Returns
// { ready: false } until the first snapshot lands so the home screen
// can show a loading state.
export function usePair(uid: string | null): PairState {
  const [state, setState] = useState<PairState>({ ready: false });

  useEffect(() => {
    if (!uid) {
      setState({ ready: true, partnerUid: null });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, partnerUid: null });
      return;
    }
    const r = ref(fb.database, `users/${uid}/profile/partner_uid`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val();
      setState({
        ready: true,
        partnerUid: typeof val === 'string' ? val : null,
      });
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  }, [uid]);

  return state;
}
