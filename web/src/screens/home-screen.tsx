import { Link } from 'react-router-dom';
import { User } from 'firebase/auth';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { usePair } from '../hooks/use-pair';
import styles from './home-screen.module.css';

export function HomeScreen({ user }: { user: User }) {
  const pair = usePair(user.uid);

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

      {!pair.ready ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>Loading…</p>
        </div>
      ) : !pair.partnerUid ? (
        <UnpairedCard />
      ) : (
        <PairedCard />
      )}
    </AppShell>
  );
}

function UnpairedCard() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Pair with your partner</h3>
      <p className={styles.cardBody}>
        Reflect works one-on-one — two people, two devices. Pair up once and
        Reflect remembers you both from then on.
      </p>
      <div className={styles.cardActions}>
        <Link to="/pair" className={styles.linkAsButton}>
          Pair up
        </Link>
      </div>
    </div>
  );
}

function PairedCard() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Sessions land here soon</h3>
      <p className={styles.cardBody}>
        You&apos;re paired. The full conversation flow — moderation,
        translation, mirroring, wrap-up — lands in the next commit.
      </p>
      <Button variant="ghost" disabled>
        Start a session (soon)
      </Button>
    </div>
  );
}
