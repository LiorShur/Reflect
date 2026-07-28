import { FormEvent, useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { TextField } from '../components/text-field';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';
import styles from './profile-screen.module.css';

// Simple profile editor. Right now it only exposes display_name, which
// is what a partner sees during pairing and in appreciation entries.
// Writes go to users/{uid}/profile/display_name (self-writable per
// security rules) plus firebase Auth's displayName field so it's
// available offline via currentUser.
export function ProfileScreen() {
  const navigate = useNavigate();
  const auth = useAuthState();
  const currentUser = auth.status === 'ready' ? auth.user : null;

  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.displayName) setDisplayName(currentUser.displayName);
  }, [currentUser?.displayName]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length === 0) return;
    const fb = tryInitFirebase();
    if (!fb || !fb.auth.currentUser) return;

    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        updateProfile(fb.auth.currentUser, { displayName: trimmed }),
        set(
          ref(
            fb.database,
            `users/${fb.auth.currentUser.uid}/profile/display_name`,
          ),
          trimmed,
        ),
      ]);
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Profile" back>
      <form onSubmit={submit} className={styles.form}>
        <p className={styles.intro}>
          This name is what your partner sees during pairing and in the
          appreciation feed. Choose whatever feels right — first name is usually
          plenty.
        </p>

        <TextField
          label="Display name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Sam"
          maxLength={40}
          autoComplete="given-name"
          disabled={busy}
          required
        />

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {savedTick ? (
          <p className={styles.savedTick} role="status">
            Saved
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => navigate('/settings')}
            disabled={busy}
          >
            Back
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={displayName.trim().length === 0}
          >
            Save
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
