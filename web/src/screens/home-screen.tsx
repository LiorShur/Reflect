import { Link } from 'react-router-dom';
import { User } from 'firebase/auth';

import { AppShell } from '../components/app-shell';
import styles from './home-screen.module.css';

// Placeholder Home. Phase 2 replaces the body with pairing / session
// state. For now this proves the auth-gated shell and gives access to
// Settings.
export function HomeScreen({ user }: { user: User }) {
  return (
    <AppShell
      rightSlot={
        <Link
          to="/settings"
          className={styles.settingsLink}
          aria-label="Settings"
        >
          Settings
        </Link>
      }
    >
      <div className={styles.hero}>
        <h1 className={styles.title}>Welcome</h1>
        <p className={styles.subtitle}>{user.displayName ?? user.email}</p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Sessions land here soon</h3>
        <p className={styles.cardBody}>
          Pairing and conversation flow arrive in the next PR. For now you can
          visit Settings to update your profile, send feedback, or find support
          resources.
        </p>
      </div>
    </AppShell>
  );
}
