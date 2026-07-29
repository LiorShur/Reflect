import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link, useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import { usePair } from '../hooks/use-pair';
import { usePartnerProfile } from '../hooks/use-partner-profile';
import { useScreening } from '../hooks/use-screening';
import {
  useActiveSessionId,
  usePartnerSessionPresence,
  useSession,
} from '../hooks/use-session';
import {
  appreciationSuppressed,
  useLastConflictAt,
} from '../hooks/use-last-conflict-at';
import styles from './home-screen.module.css';

export function HomeScreen({ user }: { user: User }) {
  const navigate = useNavigate();
  const pair = usePair(user.uid);
  const screening = useScreening(user.uid);
  const rawActiveSessionId = useActiveSessionId(user.uid);
  const partnerUid = pair.ready ? pair.partnerUid : null;
  const partnerProfile = usePartnerProfile(partnerUid);
  const partnerName = partnerProfile.ready
    ? partnerProfile.profile.displayName
    : null;
  // If the active_session_id pointer still references a session that's
  // ENDED or WRAP_UP, treat it as no active session. Two reasons:
  //   - ENDED: server-side null hasn't propagated yet, or the confirm
  //     trigger raced — otherwise the auto-route below pulls the user
  //     back into the dead session in a loop from EndedView's "Back
  //     to home" button.
  //   - WRAP_UP: user leaving wrap-up voluntarily should stick on
  //     Home, not get yanked back. If both partners still need to
  //     confirm, they can re-enter from a Resume card that renders
  //     for non-ENDED, non-WRAP_UP live states only.
  const activeSessionView = useSession(rawActiveSessionId);
  const activeSessionFinished =
    rawActiveSessionId !== null &&
    activeSessionView.ready &&
    activeSessionView.meta !== null &&
    (activeSessionView.meta.state === 'ENDED' ||
      activeSessionView.meta.state === 'WRAP_UP');
  const activeSessionId = activeSessionFinished ? null : rawActiveSessionId;
  const partnerInSession = usePartnerSessionPresence(
    activeSessionId,
    partnerUid,
  );
  const lastConflictAt = useLastConflictAt(user.uid);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screeningDone = screening.ready && screening.completed;
  const paired = pair.ready && pair.partnerUid !== null;
  const unpaired = pair.ready && pair.partnerUid === null;
  const tierLow =
    screening.ready && screening.completed && screening.tier === 'low';
  const appreciationOff = appreciationSuppressed(lastConflictAt);

  // Auto-route on the transition "no session → session exists". The
  // ref stops a Back-press from re-routing into the session; first
  // mount with an existing pointer DOES navigate so the second device
  // joins after the first creates.
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    if (prev === null && activeSessionId !== null) {
      navigate(`/session/${activeSessionId}`);
    }
    prevSessionIdRef.current = activeSessionId;
  }, [activeSessionId, navigate]);

  // Partner-presence auto-route: partner opens the session on their
  // device → this device follows.
  const prevPartnerInSessionRef = useRef(false);
  useEffect(() => {
    const prev = prevPartnerInSessionRef.current;
    if (!prev && partnerInSession && activeSessionId) {
      navigate(`/session/${activeSessionId}`);
    }
    prevPartnerInSessionRef.current = partnerInSession;
  }, [partnerInSession, activeSessionId, navigate]);

  const startSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ mode: 'conflict' }, { session_id: string }>(
        getFunctions(fb.app),
        'createSession',
      );
      const result = await fn({ mode: 'conflict' });
      navigate(`/session/${result.data.session_id}`);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setCreating(false);
    }
  };

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
        <h1 className={styles.title}>Reflect</h1>
        <p className={styles.subtitle}>{user.displayName ?? user.email}</p>
        {partnerName ? (
          <p className={styles.partnerChip}>paired with {partnerName}</p>
        ) : null}
      </div>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      {!screening.ready || !pair.ready ? (
        <Card>
          <p className={styles.cardBody}>Loading…</p>
        </Card>
      ) : !screeningDone ? (
        <ScreeningCta />
      ) : unpaired && screening.tier !== 'high' ? (
        <UnpairedCard />
      ) : activeSessionId ? (
        <ResumeCard
          activeSessionId={activeSessionId}
          partnerInSession={partnerInSession}
        />
      ) : paired && tierLow ? (
        <StartSessionCard onStart={startSession} busy={creating} />
      ) : paired && screening.tier !== 'low' ? (
        <ModerateOrHighCard />
      ) : (
        <UnpairedCard />
      )}

      {paired && screeningDone ? (
        <div className={styles.appreciationRow}>
          {appreciationOff ? (
            <p className={styles.suppressedNote}>
              Give it a few hours after a session before sending an appreciation
              — space usually helps it land. But it&apos;s your call:
            </p>
          ) : null}
          <Link to="/appreciation" className={styles.secondaryLink}>
            Send an appreciation
          </Link>
          <Link to="/appreciation-feed" className={styles.secondaryLink}>
            Appreciation feed
          </Link>
        </div>
      ) : null}
    </AppShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

function ScreeningCta() {
  return (
    <Card>
      <h3 className={styles.cardTitle}>Start with a quick check-in</h3>
      <p className={styles.cardBody}>
        A short set of questions helps us tune Reflect to how things are for you
        right now. Your answers stay private.
      </p>
      <div className={styles.cardActions}>
        <Link to="/screening" className={styles.linkAsButton}>
          Begin check-in
        </Link>
      </div>
    </Card>
  );
}

function UnpairedCard() {
  return (
    <Card>
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
    </Card>
  );
}

function ResumeCard({
  activeSessionId,
  partnerInSession,
}: {
  activeSessionId: string;
  partnerInSession: boolean;
}) {
  return (
    <Card>
      <h3 className={styles.cardTitle}>
        {partnerInSession
          ? 'Your partner is in the session'
          : 'You have an active session'}
      </h3>
      <p className={styles.cardBody}>
        {partnerInSession
          ? 'They just opened it. Join them when you&apos;re ready.'
          : "You started or joined a session. Return when you're ready to continue."}
      </p>
      <div className={styles.cardActions}>
        <Link
          to={`/session/${activeSessionId}`}
          className={styles.linkAsButton}
        >
          {partnerInSession ? 'Join' : 'Resume session'}
        </Link>
      </div>
    </Card>
  );
}

function StartSessionCard({
  onStart,
  busy,
}: {
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <h3 className={styles.cardTitle}>Ready to talk</h3>
      <p className={styles.cardBody}>
        Start a moderated conversation. One of you kicks it off; the other joins
        from their device.
      </p>
      <div className={styles.cardActions}>
        <Button variant="primary" onClick={onStart} busy={busy}>
          Start a session
        </Button>
      </div>
    </Card>
  );
}

function ModerateOrHighCard() {
  return (
    <Card>
      <h3 className={styles.cardTitle}>Joint mode is paused</h3>
      <p className={styles.cardBody}>
        Based on your check-in responses, we&apos;ve paused joint conflict
        sessions for now. If you&apos;d like to update your answers or find
        support, see Settings.
      </p>
      <div className={styles.cardActions}>
        <Link to="/resources" className={styles.linkAsButton}>
          See resources
        </Link>
      </div>
    </Card>
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
