import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';

import { tryInitFirebase } from '../firebase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'ready'; user: User | null }
  | { status: 'error'; error: 'not_configured' };

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ status: 'error', error: 'not_configured' });
      return undefined;
    }
    const unsubscribe = onAuthStateChanged(fb.auth, (user) => {
      setState({ status: 'ready', user });
    });
    return unsubscribe;
  }, []);

  return state;
}
