import { FormEvent, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import styles from './feedback-screen.module.css';

// Pilot-ops: in-app feedback. Writes to /feedback/{uid} via a callable
// (server-only readable). Testers describe issues in their own words;
// we get context (app version, uid to correlate with telemetry).
export function FeedbackScreen() {
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      const fn = httpsCallable<
        { body: string; app_version?: string },
        { ok: true }
      >(getFunctions(fb.app), 'submitFeedback');
      await fn({
        body: trimmed,
        app_version: `web-${import.meta.env.VITE_SENTRY_ENV ?? 'dev'}`,
      });
      setSent(true);
      setBody('');
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AppShell title="Send feedback" back>
        <div className={styles.doneCard}>
          <h3 className={styles.doneHeading}>Thank you</h3>
          <p className={styles.doneBody}>
            We received your feedback. During the pilot the team reads every
            note.
          </p>
          <div className={styles.doneActions}>
            <Button variant="secondary" onClick={() => setSent(false)}>
              Send another
            </Button>
            <Button variant="primary" onClick={() => navigate('/settings')}>
              Back to settings
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Send feedback" back>
      <form onSubmit={submit} className={styles.form}>
        <p className={styles.intro}>
          Bug, confusion, or just a thought — what would make Reflect better for
          you?
        </p>

        <label htmlFor="feedback-body" className={styles.label}>
          Your message
        </label>
        <textarea
          id="feedback-body"
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell us…"
          maxLength={4000}
          disabled={busy}
          rows={8}
          autoFocus
        />

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={body.trim().length === 0}
          >
            Send feedback
          </Button>
        </div>

        <p className={styles.footnote}>
          Please don&apos;t include anything sensitive you wouldn&apos;t want
          associated with your account.
        </p>
      </form>
    </AppShell>
  );
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
