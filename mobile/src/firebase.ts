import {
  initializeApp,
  getApps,
  FirebaseApp,
  FirebaseOptions,
} from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
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
  return { app, auth: getAuth(app), database: getDatabase(app) };
}
