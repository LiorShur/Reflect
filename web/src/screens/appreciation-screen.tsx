import { FormEvent, useMemo, useState } from 'react';
import { push, ref, set } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';
import { usePair } from '../hooks/use-pair';
import styles from './appreciation-screen.module.css';

// Duplicated from functions/src/friendship/specificity.ts (mobile
// also inlines this for the same reason — the mobile/web workspace
// doesn't depend on functions).
const STOPWORDS = new Set([
  'thanks',
  'thank',
  'love',
  'you',
  'the',
  'a',
  'an',
  'is',
  'was',
  'were',
  'been',
  'being',
  'are',
  'am',
  'so',
  'much',
  'really',
  'very',
  'good',
  'great',
  'nice',
  'sweet',
  'kind',
  'i',
  'me',
  'my',
  'mine',
  'your',
  'yours',
  'for',
  'to',
  'today',
  'tonight',
  'always',
  'just',
  'and',
  'or',
  'but',
  'wow',
  'yeah',
  'yes',
  'cool',
  'awesome',
]);

function isGenericAppreciation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length >= 25) return false;
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const nonStop = tokens.filter((t) => !STOPWORDS.has(t));
  return nonStop.length < 2;
}

const TAGS = ['helped me', 'made me laugh', 'was patient', 'was kind'];

// R1 — Daily appreciation. One prompt, optional tag chips, inline
// specificity nudge for generic input. Writes to
// /appreciation_feed/{partner_uid}/{auto-id} per existing rules.
export function AppreciationScreen() {
  const navigate = useNavigate();
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const pair = usePair(uid);
  const partnerUid = pair.ready ? pair.partnerUid : null;

  const [text, setText] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const generic = useMemo(() => isGenericAppreciation(text), [text]);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !!partnerUid && !busy;

  const toggleTag = (tag: string) => {
    setActiveTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend || !uid || !partnerUid) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const feedRef = ref(fb.database, `appreciation_feed/${partnerUid}`);
      const entryRef = push(feedRef);
      await set(entryRef, {
        from_uid: uid,
        content: trimmed,
        tags: activeTags.length > 0 ? activeTags : null,
        created_at: Date.now(),
      });
      setSent(true);
      setText('');
      setActiveTags([]);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!partnerUid) {
    return (
      <AppShell title="Send appreciation" back>
        <h2 className={styles.heading}>Pair first</h2>
        <p className={styles.paragraph}>
          You need a paired partner before you can send appreciations.
        </p>
      </AppShell>
    );
  }

  if (sent) {
    return (
      <AppShell title="Sent" back>
        <div className={styles.doneCard}>
          <h3 className={styles.doneHeading}>Delivered</h3>
          <p className={styles.doneBody}>
            Your partner will see it on their feed.
          </p>
          <div className={styles.doneActions}>
            <Button variant="secondary" onClick={() => setSent(false)}>
              Send another
            </Button>
            <Button variant="primary" onClick={() => navigate('/')}>
              Back home
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Today's appreciation" back>
      <p className={styles.stepLabel}>Today&apos;s appreciation</p>
      <h2 className={styles.heading}>
        What did your partner do today that you appreciated?
      </h2>
      <p className={styles.paragraph}>
        One specific thing lands better than something general. No pressure to
        send if nothing&apos;s coming to mind.
      </p>

      <form onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="They did this thing today…"
          className={styles.input}
          disabled={busy}
          maxLength={500}
          rows={5}
          autoFocus
        />
        {generic ? (
          <p className={styles.nudge}>
            What specifically today? A small concrete moment lands stronger.
          </p>
        ) : null}

        <p className={styles.smallLabel}>Optional tags</p>
        <div className={styles.tagRow}>
          {TAGS.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={[styles.tag, active ? styles.tagActive : ''].join(
                  ' ',
                )}
                onClick={() => toggleTag(tag)}
                disabled={busy}
                aria-pressed={active}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" busy={busy} disabled={!canSend}>
          Send to partner
        </Button>
      </form>
    </AppShell>
  );
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = 'code' in err ? String((err as { code: unknown }).code) : '';
    const message =
      'message' in err ? String((err as { message: unknown }).message) : '';
    if (message) return code ? `${message} [${code}]` : message;
    if (code) return `Server error: ${code}`;
  }
  return String(err);
}
