import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeApp,
  getApps,
  FirebaseApp,
  FirebaseOptions,
} from 'firebase/app';
import {
  Auth,
  getAuth,
  initializeAuth,
  // @ts-expect-error — getReactNativePersistence is exported at runtime
  // but missing from firebase 10.x public type definitions.
  getReactNativePersistence,
} from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';

// Public config — safe to ship in the bundle. Real values come from
// EXPO_PUBLIC_* env vars (see .env.example). Server-side keys never
// touch the client per CLAUDE.md safety rail #1.
const config: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
};

export interface FirebaseHandle {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
}

// Returns null if EXPO_PUBLIC_FIREBASE_* env vars are missing — lets
// the placeholder screen render before milestone 2 wires up real auth.
export function tryInitFirebase(): FirebaseHandle | null {
  if (!config.apiKey || !config.projectId) return null;

  const app = getApps()[0] ?? initializeApp(config);

  // On React Native, the auth component must be registered explicitly
  // with AsyncStorage persistence — getAuth() alone will throw
  // "Component auth has not been registered yet" before initializeAuth
  // has run. After the first call, initializeAuth throws if called
  // again, so we fall back to getAuth() on subsequent inits (HMR,
  // remounts).
  let auth: Auth;
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }

  return { app, auth, database: getDatabase(app) };
}
