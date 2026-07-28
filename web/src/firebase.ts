import {
  initializeApp,
  getApps,
  FirebaseApp,
  FirebaseOptions,
} from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';

// Public config — safe to ship in the bundle. Real values come from
// VITE_FIREBASE_* env vars (see .env.example). Server-side keys never
// touch the client per CLAUDE.md safety rail #1.
const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
};

export interface FirebaseHandle {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
}

// Returns null if VITE_FIREBASE_* env vars are missing — lets the
// scaffold render a friendly "configure your .env" screen instead
// of crashing on first render.
//
// Web Auth uses IndexedDB persistence by default via getAuth() — no
// need for the initializeAuth + AsyncStorage dance the mobile client
// requires.
export function tryInitFirebase(): FirebaseHandle | null {
  if (!config.apiKey || !config.projectId) return null;
  const app = getApps()[0] ?? initializeApp(config);
  return { app, auth: getAuth(app), database: getDatabase(app) };
}
