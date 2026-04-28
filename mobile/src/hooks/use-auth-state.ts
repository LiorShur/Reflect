import { useEffect, useState } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

export type AuthState =
  | { ready: false }
  | { ready: true; user: FirebaseAuthTypes.User | null }
  | { ready: true; error: 'not_configured' };

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ ready: false });

  useEffect(() => {
    // react-native-firebase throws synchronously if google-services.json /
    // GoogleService-Info.plist is missing. Catch it so the placeholder
    // screen still renders during scaffold work — real Firebase config
    // lands in milestone 2.
    try {
      const unsubscribe = auth().onAuthStateChanged((user) => {
        setState({ ready: true, user });
      });
      return unsubscribe;
    } catch {
      setState({ ready: true, error: 'not_configured' });
      return undefined;
    }
  }, []);

  return state;
}
