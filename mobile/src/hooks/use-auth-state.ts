import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';

import { tryInitFirebase } from '../firebase';

export type AuthState =
  | { ready: false }
  | { ready: true; user: User | null }
  | { ready: true; error: 'not_configured' };

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ ready: false });

  useEffect(() => {
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, error: 'not_configured' });
      return undefined;
    }
    const unsubscribe = onAuthStateChanged(fb.auth, (user) => {
      setState({ ready: true, user });
    });
    return unsubscribe;
  }, []);

  return state;
}
