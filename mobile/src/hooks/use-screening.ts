import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export type Tier = 'low' | 'moderate' | 'high';

export type ScreeningState =
  | { ready: false }
  | { ready: true; completed: false }
  | {
      ready: true;
      completed: true;
      tier: Tier;
      flags: string[];
      completedAt: number;
    };

interface ScreeningRecord {
  completed_at?: number;
  tier?: Tier;
  flags?: string[];
}

// Subscribes to users/{uid}/screening so the UI reactively reflects
// whether the user has completed the screening flow and (if so) at
// what tier. Returns ready: false until the first snapshot lands.
export function useScreening(uid: string | null): ScreeningState {
  const [state, setState] = useState<ScreeningState>({ ready: false });

  useEffect(() => {
    if (!uid) {
      setState({ ready: true, completed: false });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, completed: false });
      return;
    }
    const r = ref(fb.database, `users/${uid}/screening`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as ScreeningRecord | null;
      if (
        !val ||
        typeof val.completed_at !== 'number' ||
        !val.tier ||
        !Array.isArray(val.flags)
      ) {
        setState({ ready: true, completed: false });
        return;
      }
      setState({
        ready: true,
        completed: true,
        tier: val.tier,
        flags: val.flags,
        completedAt: val.completed_at,
      });
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  }, [uid]);

  return state;
}
