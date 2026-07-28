import { useState } from 'react';
import { signOut, User } from 'firebase/auth';

import { tryInitFirebase } from '../firebase';
import { Button } from '../components/button';
import styles from './placeholder-home-screen.module.css';

// Temporary landing view for the auth-gated stack until Commit 3
// introduces the real app shell (settings / session / pair routes).
// Kept intentionally sparse so the auth gate itself can be validated
// end-to-end without waiting on the rest of the port.
export function PlaceholderHomeScreen({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    const fb = tryInitFirebase();
    if (fb) await signOut(fb.auth);
    setBusy(false);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <h2 className={styles.heading}>Signed in</h2>
        <p className={styles.body}>
          You are signed in as <strong>{user.email}</strong>.
        </p>
        <p className={styles.body}>
          The rest of the app — pairing, sessions, wrap-up — is landing in the
          next commit. For now, this screen just proves auth is wired
          end-to-end.
        </p>
        <Button variant="secondary" onClick={handleSignOut} busy={busy}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
