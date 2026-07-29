import { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { TextField } from '../components/text-field';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';
import { usePair } from '../hooks/use-pair';
import { usePartnerProfile } from '../hooks/use-partner-profile';
import styles from './settings-screen.module.css';

export function SettingsScreen() {
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const pair = usePair(uid);
  const partnerUid = pair.ready ? pair.partnerUid : null;
  const partnerProfile = usePartnerProfile(partnerUid);
  const partnerName = partnerProfile.ready
    ? partnerProfile.profile.displayName
    : null;

  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [unpairBusy, setUnpairBusy] = useState(false);
  const [confirmingUnpair, setConfirmingUnpair] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = auth.status === 'ready' && auth.user ? auth.user.email : null;

  const doSignOut = async () => {
    setSignOutBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) return;
      await signOut(fb.auth);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSignOutBusy(false);
    }
  };

  const doUnpair = async () => {
    setUnpairBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<Record<string, never>, { ok: true }>(
        getFunctions(fb.app),
        'unpair',
      );
      await fn({});
      setConfirmingUnpair(false);
      // The usePair listener flips to null automatically; Home routes
      // to the "Pair up" state on next render.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setUnpairBusy(false);
    }
  };

  const doDelete = async () => {
    const fb = tryInitFirebase();
    if (!fb || !fb.auth.currentUser || !email) return;
    if (reauthPassword.length === 0) {
      setError('Re-enter your password so we can confirm this is you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Firebase requires a recent sign-in for account-destructive
      // operations. Re-authenticate before the callable so the delete
      // succeeds even if the user signed in an hour ago.
      const cred = EmailAuthProvider.credential(email, reauthPassword);
      await reauthenticateWithCredential(fb.auth.currentUser, cred);
      const fn = httpsCallable<Record<string, never>, { ok: true }>(
        getFunctions(fb.app),
        'deleteUserData',
      );
      await fn({});
      // Server has already destroyed the Auth user, but the client's
      // cached ID token won't know until it tries to refresh (up to
      // an hour). Explicit signOut fires onAuthStateChanged(null)
      // immediately so AuthGate flips us to /sign-in right away.
      await signOut(fb.auth);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      setReauthPassword('');
    }
  };

  return (
    <AppShell title="Settings" back>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.heading}>Profile</h3>
        {email ? (
          <p className={styles.paragraph}>Signed in as {email}</p>
        ) : null}
        <Link to="/profile" className={styles.linkButton}>
          Edit profile
        </Link>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Feedback</h3>
        <p className={styles.paragraph}>
          Anything confusing, broken, or missing? We&apos;re reading every note
          during the pilot.
        </p>
        <Link to="/feedback" className={styles.linkButton}>
          Send feedback
        </Link>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Support &amp; safety</h3>
        <p className={styles.paragraph}>
          If you or someone you love needs to talk to a person, help lines are
          here for you.
        </p>
        <Link to="/resources" className={styles.linkButton}>
          See support resources
        </Link>
      </section>

      {partnerUid ? (
        <section className={styles.section}>
          <h3 className={styles.heading}>Partner</h3>
          <p className={styles.paragraph}>
            You&apos;re paired with{' '}
            <strong>{partnerName ?? 'your partner'}</strong>. Unpairing
            disconnects both of you — you can then pair with someone else, or
            the same person again with a new code.
          </p>
          {!confirmingUnpair ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmingUnpair(true)}
              disabled={unpairBusy}
            >
              Unpair from partner
            </Button>
          ) : (
            <div className={styles.deleteBlock}>
              <p className={styles.paragraph}>
                Unpair from {partnerName ?? 'your partner'}? Any active session
                gets ended for both of you.
              </p>
              <div className={styles.deleteActions}>
                <Button variant="danger" onClick={doUnpair} busy={unpairBusy}>
                  Unpair
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingUnpair(false)}
                  disabled={unpairBusy}
                >
                  Keep pairing
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.heading}>Account</h3>
        <Button variant="secondary" onClick={doSignOut} busy={signOutBusy}>
          Sign out
        </Button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Delete account</h3>
        <p className={styles.paragraph}>
          Removes your account, your pairing, all session history, your
          appreciation feed, and your baseline. Your partner&apos;s data stays
          with them. This cannot be undone.
        </p>
        {!showDelete ? (
          <Button
            variant="danger"
            onClick={() => setShowDelete(true)}
            disabled={busy}
          >
            Delete my account
          </Button>
        ) : (
          <div className={styles.deleteBlock}>
            <TextField
              label="Re-enter your password to confirm"
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={busy}
            />
            <div className={styles.deleteActions}>
              <Button
                variant="danger"
                onClick={doDelete}
                busy={busy}
                disabled={reauthPassword.length === 0}
              >
                Delete permanently
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowDelete(false);
                  setReauthPassword('');
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as AuthError).code;
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Password is incorrect.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a minute and try again.';
      case 'auth/network-request-failed':
        return 'Network issue. Check your connection and try again.';
      default:
        if ('message' in err)
          return String((err as { message: unknown }).message);
        return `Auth error (${code}).`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
