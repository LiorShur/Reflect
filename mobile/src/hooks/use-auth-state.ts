import { useEffect, useState } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

export type AuthState =
  | { ready: false }
  | { ready: true; user: FirebaseAuthTypes.User | null };

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ ready: false });

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((user) => {
      setState({ ready: true, user });
    });
    return unsubscribe;
  }, []);

  return state;
}
