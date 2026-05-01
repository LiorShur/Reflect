import { useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';

import { tryInitFirebase } from '../firebase';

// Bridge auth: every device gets a stable Firebase uid via anonymous
// sign-in so pairing can bind partners. Real email/Google/Apple
// sign-in (A1) ships in a follow-up PR; anonymous accounts can be
// linked to a permanent identity via linkWithCredential when that
// lands.
//
// No-op if EXPO_PUBLIC_FIREBASE_* env vars aren't set — the home
// screen will keep showing "firebase not configured".
export function useAutoSignIn(): void {
  useEffect(() => {
    const fb = tryInitFirebase();
    if (!fb) return;

    const unsubscribe = onAuthStateChanged(fb.auth, (user) => {
      if (user === null) {
        signInAnonymously(fb.auth).catch((err) => {
          // Log only — no UI surface yet. The auth-state hook will
          // keep showing "not signed in" so the failure is visible.
          // eslint-disable-next-line no-console
          console.error('[reflect] anonymous sign-in failed:', err);
        });
      }
    });
    return unsubscribe;
  }, []);
}
