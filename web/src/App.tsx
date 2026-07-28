import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { useAuthState } from './hooks/use-auth-state';
import { SignInScreen } from './screens/sign-in-screen';
import { HomeScreen } from './screens/home-screen';
import { SettingsScreen } from './screens/settings-screen';
import { FeedbackScreen } from './screens/feedback-screen';
import { ResourcesScreen } from './screens/resources-screen';
import { ProfileScreen } from './screens/profile-screen';
import { PairScreen } from './screens/pair-screen';
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

  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInScreen />} />
        <Route path="/*" element={<RequireSignIn />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/sign-in" element={<Navigate to="/" replace />} />
      <Route path="/" element={<HomeScreen user={user} />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/pair" element={<PairScreen />} />
      <Route path="/feedback" element={<FeedbackScreen />} />
      <Route path="/resources" element={<ResourcesScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/*" element={<Navigate to="/" replace />} />
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
