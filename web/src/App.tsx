import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { useAuthState } from './hooks/use-auth-state';
import { SignInScreen } from './screens/sign-in-screen';
import { PlaceholderHomeScreen } from './screens/placeholder-home-screen';
import styles from './App.module.css';

export function App() {
  return (
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  );
}

function AuthGate() {
  const auth = useAuthState();

  if (auth.status === 'loading') return <LoadingSplash />;
  if (auth.status === 'error') return <ConfigMissingSplash />;

  const { user } = auth;

  return (
    <Routes>
      <Route
        path="/sign-in"
        element={user ? <Navigate to="/" replace /> : <SignInScreen />}
      />
      <Route
        path="/*"
        element={
          user ? <PlaceholderHomeScreen user={user} /> : <RequireSignIn />
        }
      />
    </Routes>
  );
}

function RequireSignIn() {
  const loc = useLocation();
  return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
}

function LoadingSplash() {
  return (
    <div className={styles.splash}>
      <p className={styles.splashDim}>Loading…</p>
    </div>
  );
}

function ConfigMissingSplash() {
  return (
    <div className={styles.splash}>
      <div className={styles.splashCard}>
        <h4>Almost ready</h4>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          your Firebase project keys, then reload.
        </p>
      </div>
    </div>
  );
}
