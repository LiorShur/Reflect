import { FormEvent, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';

import { tryInitFirebase } from '../firebase';
import { Button } from '../components/button';
import { TextField } from '../components/text-field';
import styles from './sign-in-screen.module.css';

type Mode = 'sign_in' | 'sign_up';

// Auth entry point. Renders full-page from App.tsx's auth gate when
// useAuthState reports no user. On success, onAuthStateChanged flips
// the gate and the router mounts the signed-in stack.
export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearMessages = () => {
    if (error) setError(null);
    if (notice) setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (cleanEmail.length === 0 || password.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      if (mode === 'sign_in') {
        await signInWithEmailAndPassword(fb.auth, cleanEmail, password);
      } else {
        await createUserWithEmailAndPassword(fb.auth, cleanEmail, password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const cleanEmail = email.trim();
    if (cleanEmail.length === 0) {
      setError('Enter your email above first, then click Forgot password.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      await sendPasswordResetEmail(fb.auth, cleanEmail);
      setNotice(
        `We sent a reset link to ${cleanEmail}. Follow it, then come back and sign in.`,
      );
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !busy;

  const primaryLabel = mode === 'sign_in' ? 'Sign in' : 'Create account';

  return (
    <div className={styles.shell}>
      <div className={styles.hero}>
        <h1 className={styles.brand}>Reflect</h1>
        <p className={styles.tagline}>
          A quieter way to have the conversations that matter.
        </p>
      </div>

      <form className={styles.card} onSubmit={submit} noValidate>
        <div className={styles.tabRow} role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'sign_in'}
            className={[
              styles.tab,
              mode === 'sign_in' ? styles.tabActive : '',
            ].join(' ')}
            onClick={() => {
              setMode('sign_in');
              clearMessages();
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'sign_up'}
            className={[
              styles.tab,
              mode === 'sign_up' ? styles.tabActive : '',
            ].join(' ')}
            onClick={() => {
              setMode('sign_up');
              clearMessages();
            }}
          >
            Create account
          </button>
        </div>

        <div className={styles.fields}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearMessages();
            }}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            required
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearMessages();
            }}
            placeholder={
              mode === 'sign_up' ? 'At least 6 characters' : 'Your password'
            }
            autoComplete={
              mode === 'sign_up' ? 'new-password' : 'current-password'
            }
            disabled={busy}
            required
            minLength={6}
          />
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}

        <Button
          type="submit"
          variant="primary"
          block
          busy={busy}
          disabled={!canSubmit}
        >
          {primaryLabel}
        </Button>

        {mode === 'sign_in' ? (
          <Button
            type="button"
            variant="ghost"
            block
            onClick={resetPassword}
            disabled={busy}
          >
            Forgot password?
          </Button>
        ) : null}

        <p className={styles.footnote}>
          By continuing you agree to the{' '}
          <a
            href="https://liorshur.github.io/Reflect/terms"
            target="_blank"
            rel="noreferrer"
          >
            terms
          </a>{' '}
          and{' '}
          <a
            href="https://liorshur.github.io/Reflect/privacy"
            target="_blank"
            rel="noreferrer"
          >
            privacy policy
          </a>
          .
        </p>
      </form>
    </div>
  );
}

function friendlyAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as AuthError).code;
    switch (code) {
      case 'auth/invalid-email':
        return "That email doesn't look right.";
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return "Email and password don't match an account. Check the spelling or create an account.";
      case 'auth/email-already-in-use':
        return 'An account with that email already exists. Try signing in.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network issue. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a minute and try again.';
      default:
        return `Auth error (${code}). Try again in a moment.`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
