import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';
import { usePair } from '../hooks/use-pair';
import styles from './pair-screen.module.css';

type Mode = 'choose' | 'generate' | 'enter';

interface CreateResponse {
  code: string;
}

interface RedeemResponse {
  partner_uid: string;
}

export function PairScreen() {
  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const navigate = useNavigate();
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const pair = usePair(uid);

  // Bounce home as soon as the pair binding lands in RTDB. Covers the
  // asymmetric case where the code-generating device is sitting on
  // "share this code" — the redemption from the other side wouldn't
  // otherwise notify this UI.
  useEffect(() => {
    if (pair.ready && pair.partnerUid) navigate('/');
  }, [pair, navigate]);

  const callCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase is not configured.');
      const fn = httpsCallable<unknown, CreateResponse>(
        getFunctions(fb.app),
        'createPairCode',
      );
      const result = await fn();
      setCode(result.data.code);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const callRedeem = async () => {
    if (!/^\d{6}$/.test(enteredCode)) {
      setError('Codes are 6 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase is not configured.');
      const fn = httpsCallable<{ code: string }, RedeemResponse>(
        getFunctions(fb.app),
        'redeemPairCode',
      );
      await fn({ code: enteredCode });
      setNotice(
        "Paired. We'll return you home now that you and your partner are connected.",
      );
      // Home redirect kicks in via the usePair effect above once the
      // /users/{uid}/profile/partner_uid write lands.
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'choose') {
    return (
      <AppShell title="Pair with your partner" back>
        <p className={styles.intro}>
          One of you generates a code, the other enters it. Codes expire after
          10 minutes.
        </p>
        <div className={styles.choiceRow}>
          <button
            type="button"
            className={styles.choiceCard}
            onClick={() => setMode('generate')}
          >
            <span className={styles.choiceTitle}>Generate a code</span>
            <span className={styles.choiceHint}>
              Give this code to your partner
            </span>
          </button>
          <button
            type="button"
            className={styles.choiceCard}
            onClick={() => setMode('enter')}
          >
            <span className={styles.choiceTitle}>
              Enter partner&apos;s code
            </span>
            <span className={styles.choiceHint}>You have a 6-digit code</span>
          </button>
        </div>
      </AppShell>
    );
  }

  if (mode === 'generate') {
    return (
      <AppShell title="Share this code" back>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {code ? (
          <div className={styles.codeBlock}>
            <p className={styles.codeIntro}>Read this to your partner:</p>
            <p
              className={styles.bigCode}
              aria-label={`Pair code ${code.split('').join(' ')}`}
            >
              {code}
            </p>
            <p className={styles.helper}>Expires in 10 minutes.</p>
            <p className={styles.waiting}>Waiting for them to enter it…</p>
          </div>
        ) : (
          <div className={styles.generateBlock}>
            <p className={styles.paragraph}>
              We&apos;ll create a fresh 6-digit code for you to share.
            </p>
            <Button variant="primary" onClick={callCreate} busy={busy} block>
              Generate code
            </Button>
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title="Enter partner's code" back>
      <p className={styles.intro}>
        Enter the 6-digit code your partner is reading you.
      </p>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        className={styles.codeInput}
        value={enteredCode}
        onChange={(e) => {
          setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          if (error) setError(null);
        }}
        placeholder="123456"
        aria-label="Pair code"
        disabled={busy}
        autoFocus
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      <div className={styles.actionRow}>
        <Button
          variant="primary"
          onClick={callRedeem}
          busy={busy}
          disabled={enteredCode.length !== 6}
          block
        >
          Pair
        </Button>
      </div>
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
