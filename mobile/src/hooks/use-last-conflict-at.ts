import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

// Subscribes to users/{uid}/profile/last_conflict_at — written by
// the last-conflict trigger when a conflict-mode session ends.
// Used by R5 (Home's daily-appreciation suppression).
export function useLastConflictAt(uid: string | null): number | null {
  const [ts, setTs] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setTs(null);
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setTs(null);
      return;
    }
    const r = ref(fb.database, `users/${uid}/profile/last_conflict_at`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val();
      setTs(typeof val === 'number' ? val : null);
    };
    const errorHandler = () => setTs(null);
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [uid]);

  return ts;
}

// docs/04: "no appreciation prompt within 4 hours of conflict mode".
const SUPPRESS_WINDOW_MS = 4 * 60 * 60 * 1000;

export function appreciationSuppressed(
  lastConflictAt: number | null,
  now: number = Date.now(),
): boolean {
  if (lastConflictAt === null) return false;
  return now - lastConflictAt < SUPPRESS_WINDOW_MS;
}
