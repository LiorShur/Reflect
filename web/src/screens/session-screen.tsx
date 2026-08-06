import { FormEvent, useEffect, useState } from 'react';
import { off, onDisconnect, onValue, push, ref, set } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';
import { useCurrentTurn, type CurrentTurn } from '../hooks/use-current-turn';
import { useSession, type SessionMeta } from '../hooks/use-session';
import { useSpeakerDraft } from '../hooks/use-speaker-draft';
import { useSummary, type NextAction } from '../hooks/use-summary';
import styles from './session-screen.module.css';

// Session screen — Gottman speaker/listener state machine driven by
// /sessions/{sid}/meta.state, /current_turn, /speaker_draft, and
// /summary. Each meta.state renders a specific subview; IN_TURN
// further branches by role + current_turn contents.

export function SessionScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const session = useSession(sessionId ?? null);

  // Mark this user online in the session so the partner's Home screen
  // can auto-flip them in too. onDisconnect covers crashes / tab
  // close; the explicit set(false) on unmount covers clean nav.
  useEffect(() => {
    if (!uid || !sessionId) return;
    const fb = tryInitFirebase();
    if (!fb) return;
    const presenceRef = ref(
      fb.database,
      `sessions/${sessionId}/presence/${uid}/online`,
    );
    void set(presenceRef, true);
    const disconnect = onDisconnect(presenceRef);
    void disconnect.set(false);
    return () => {
      void set(presenceRef, false);
      void disconnect.cancel();
    };
  }, [sessionId, uid]);

  if (!sessionId) {
    return (
      <AppShell title="Session" back>
        <p className={styles.helper}>No session id in URL.</p>
      </AppShell>
    );
  }

  if (!session.ready) {
    return (
      <SessionShell title="Session">
        <WaitingBody label="Loading…" />
      </SessionShell>
    );
  }

  if (session.meta === null) {
    return <StaleSessionView sessionId={sessionId} />;
  }

  if (uid === null) {
    return (
      <SessionShell title="Session">
        <p className={styles.paragraph}>Sign-in needed.</p>
      </SessionShell>
    );
  }

  const meta = session.meta;
  const isRaiser = meta.raiser_uid === uid;

  switch (meta.state) {
    case 'CHECK_IN': {
      const isPartnerA = meta.partnerA === uid;
      const selfReady = isPartnerA
        ? meta.partnerA_ready === true
        : meta.partnerB_ready === true;
      const partnerReady = isPartnerA
        ? meta.partnerB_ready === true
        : meta.partnerA_ready === true;
      if (selfReady && !partnerReady) {
        return (
          <WaitingView label="You're ready. Waiting for your partner to check in." />
        );
      }
      return (
        <CheckInView
          sessionId={sessionId}
          uid={uid}
          partnerReady={partnerReady}
        />
      );
    }
    case 'TOPIC_INTAKE':
      return isRaiser ? (
        <TopicIntakeView sessionId={sessionId} />
      ) : (
        <WaitingView label="Waiting for your partner to propose the topic." />
      );
    case 'TOPIC_AGREE':
      return isRaiser ? (
        <WaitingView label="Waiting for your partner to respond to the topic." />
      ) : (
        <TopicAgreeView sessionId={sessionId} topic={meta.topic ?? ''} />
      );
    case 'IN_TURN':
      return (
        <InTurnView sessionId={sessionId} uid={uid} topic={meta.topic ?? ''} />
      );
    case 'FLOOR_SWAP':
      return <FloorSwapView sessionId={sessionId} uid={uid} />;
    case 'PAUSED':
      return <PausedView sessionId={sessionId} uid={uid} meta={meta} />;
    case 'WRAP_UP': {
      const partnerUid = meta.partnerA === uid ? meta.partnerB : meta.partnerA;
      return (
        <WrapUpView
          sessionId={sessionId}
          uid={uid}
          partnerAUid={meta.partnerA}
          partnerUid={partnerUid ?? null}
        />
      );
    }
    case 'ENDED':
      return <EndedView />;
    default:
      return (
        <SessionShell title={meta.state}>
          <p className={styles.paragraph}>Unhandled state — see docs/06.</p>
        </SessionShell>
      );
  }
}

// --- Shells / basic bodies -------------------------------------------

function SessionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <AppShell title={title}>{children}</AppShell>;
}

function WaitingBody({ label }: { label: string }) {
  return (
    <div className={styles.center}>
      <div className={styles.spinner} aria-hidden />
      <p className={styles.waitingLabel}>{label}</p>
    </div>
  );
}

function WaitingView({ label }: { label: string }) {
  return (
    <SessionShell title="Waiting">
      <WaitingBody label={label} />
    </SessionShell>
  );
}

function EndedView() {
  return (
    <AppShell title="Session ended">
      <div className={styles.center}>
        <h2 className={styles.heading}>Session ended</h2>
        <p className={styles.paragraph}>This session is complete.</p>
        <Link to="/" className={styles.homeLink}>
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}

// Session was deleted server-side or the active_session_id pointer is
// stale. Auto-clears the pointer via clearStaleSession and routes home
// so the user doesn't loop back into an empty session.
function StaleSessionView({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fb = tryInitFirebase();
        if (!fb) return;
        const fn = httpsCallable<{ session_id: string }, { ok: true }>(
          getFunctions(fb.app),
          'clearStaleSession',
        );
        await fn({ session_id: sessionId });
      } catch {
        // Best-effort cleanup; if the callable refuses (e.g., session
        // is still active) just let the user back out manually.
      } finally {
        if (!cancelled) navigate('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigate]);

  return (
    <SessionShell title="Session">
      <WaitingBody label="Session no longer available. Returning home…" />
    </SessionShell>
  );
}

// --- CHECK_IN --------------------------------------------------------

function CheckInView({
  sessionId,
  uid,
  partnerReady,
}: {
  sessionId: string;
  uid: string;
  partnerReady: boolean;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (score === null) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      await set(ref(fb.database, `sessions/${sessionId}/checkins/${uid}`), {
        flooding_score: score,
        ready: true,
        submitted_at: Date.now(),
      });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Quick check-in">
      <p className={styles.stepLabel}>Before we begin</p>
      <h2 className={styles.heading}>Quick check-in</h2>
      {partnerReady ? (
        <div className={styles.partnerStatus}>
          <span>Your partner is ready.</span>
        </div>
      ) : null}
      <p className={styles.paragraph}>
        How activated are you right now? 1 means calm and grounded; 10 means
        overwhelmed.
      </p>
      <div className={styles.scoreRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            className={[
              styles.scoreButton,
              score === n ? styles.scoreButtonSelected : '',
            ].join(' ')}
            onClick={() => setScore(n)}
            aria-label={`Score ${n}`}
            aria-pressed={score === n}
          >
            {n}
          </button>
        ))}
      </div>
      {error ? <ErrorBanner text={error} /> : null}
      <Button
        variant="primary"
        onClick={submit}
        busy={busy}
        disabled={score === null}
      >
        I&apos;m ready
      </Button>
      <p className={styles.helper}>
        Your score stays private to you. We only use it to decide whether to
        start now or take a breather first.
      </p>
    </AppShell>
  );
}

// --- TOPIC_INTAKE / TOPIC_AGREE --------------------------------------

function TopicIntakeView({ sessionId }: { sessionId: string }) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; topic: string },
        { ok: true }
      >(getFunctions(fb.app), 'proposeTopic');
      await fn({ session_id: sessionId, topic: trimmed });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Pick a topic">
      <p className={styles.stepLabel}>Step 1 — Pick a topic</p>
      <h2 className={styles.heading}>What would you like to talk about?</h2>
      <p className={styles.paragraph}>
        Just the headline, in one sentence — not your full thoughts. Your
        partner will accept it or ask you to reframe before either of you starts
        speaking.
      </p>
      <form onSubmit={submit}>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. how we split chores on weekends"
          className={styles.topicInput}
          disabled={busy}
          maxLength={500}
          rows={3}
          autoFocus
        />
        {error ? <ErrorBanner text={error} /> : null}
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={topic.trim().length === 0}
        >
          Send topic to partner
        </Button>
      </form>
      <p className={styles.helper}>
        We&apos;ll moderate your actual statements once the conversation starts.
      </p>
    </AppShell>
  );
}

function TopicAgreeView({
  sessionId,
  topic,
}: {
  sessionId: string;
  topic: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (which: 'acceptTopic' | 'reframeTopic') => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        which,
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Topic proposed">
      <h2 className={styles.heading}>Your partner suggests:</h2>
      <div className={styles.topicBox}>
        <p className={styles.topicText}>{topic}</p>
      </div>
      {error ? <ErrorBanner text={error} /> : null}
      <div className={styles.buttonColumn}>
        <Button
          variant="primary"
          onClick={() => call('acceptTopic')}
          busy={busy}
        >
          That works — let&apos;s start
        </Button>
        <Button
          variant="secondary"
          onClick={() => call('reframeTopic')}
          disabled={busy}
        >
          Ask to reframe
        </Button>
      </div>
    </AppShell>
  );
}

// --- PAUSED ----------------------------------------------------------

function PausedView({
  sessionId,
  uid,
  meta,
}: {
  sessionId: string;
  uid: string;
  meta: SessionMeta;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pausedUntil = meta.paused_until ?? 0;
  const remainingMs = Math.max(0, pausedUntil - now);
  const timerExpired = remainingMs === 0;
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const countdownText = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const selfAcked = meta.resume_acks?.[uid] === true;
  const otherUid = meta.partnerA === uid ? meta.partnerB : meta.partnerA;
  const partnerAcked = otherUid ? meta.resume_acks?.[otherUid] === true : false;
  const selfRequested = meta.pause_requested_by === uid;
  const partnerRequested =
    !!meta.pause_requested_by && meta.pause_requested_by !== uid;

  const callResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        'resumeFromPause',
      );
      await fn({ session_id: sessionId });
      setConfirming(false);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const bodyLabel = selfRequested
    ? 'You asked for a break. Twenty minutes lets the body settle so you both come back grounded.'
    : partnerRequested
      ? 'Your partner asked for a break. Twenty minutes lets the body settle so you both come back grounded.'
      : 'The session is paused. Twenty minutes lets the body settle so you both come back grounded.';

  const primaryLabel = selfAcked
    ? partnerAcked
      ? 'Resuming…'
      : 'Waiting for your partner'
    : partnerAcked
      ? 'Continue session (partner is ready)'
      : 'Continue session';

  return (
    <AppShell title="Cooldown">
      <p className={styles.stepLabel}>Cooldown</p>
      <h2 className={styles.heading}>Take a breather</h2>
      <p className={styles.paragraph}>{bodyLabel}</p>
      <div className={styles.timerBox}>
        <p className={styles.timerLabel}>
          {timerExpired ? 'Ready when you both are' : countdownText}
        </p>
      </div>
      {partnerAcked && !selfAcked ? (
        <CueBanner text="Your partner is ready to resume." />
      ) : null}
      {error ? <ErrorBanner text={error} /> : null}
      <Button
        variant="primary"
        onClick={callResume}
        busy={busy}
        disabled={selfAcked || !timerExpired}
      >
        {primaryLabel}
      </Button>
      {!timerExpired && !selfAcked && !confirming ? (
        <Button
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          Skip the wait
        </Button>
      ) : null}
      {confirming ? (
        <div className={styles.confirmBlock}>
          <p className={styles.paragraph}>
            The 20-minute window helps the body settle. Both of you would need
            to tap continue to resume early.
          </p>
          <div className={styles.buttonRow}>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep waiting
            </Button>
            <Button variant="primary" onClick={callResume} busy={busy}>
              I&apos;m ready now
            </Button>
          </div>
        </div>
      ) : null}
      {meta.pause_reason && meta.pause_reason !== 'manual_break' ? (
        <p className={styles.helper}>Reason: {meta.pause_reason}</p>
      ) : null}
    </AppShell>
  );
}

// --- Shared: BreakButton --------------------------------------------

function BreakButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPause = async () => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        'requestPause',
      );
      await fn({ session_id: sessionId });
      setConfirming(false);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (confirming) {
    return (
      <div className={styles.confirmBlock}>
        <p className={styles.paragraph}>
          We&apos;ll pause the session for 20 minutes. Both of you will need to
          tap continue to come back.
        </p>
        {error ? <ErrorBanner text={error} /> : null}
        <div className={styles.buttonRow}>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Keep going
          </Button>
          <Button variant="danger" onClick={requestPause} busy={busy}>
            Pause for 20 min
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.breakButton}
      onClick={() => setConfirming(true)}
      disabled={busy}
    >
      I need a break
    </button>
  );
}

// --- IN_TURN router --------------------------------------------------

function InTurnView({
  sessionId,
  uid,
  topic,
}: {
  sessionId: string;
  uid: string;
  topic: string;
}) {
  const turnView = useCurrentTurn(sessionId);
  const speakerUid =
    turnView.ready && turnView.turn
      ? (turnView.turn.speaker_uid ?? null)
      : null;
  const latestFlag = useLatestSpeakerFlag(sessionId, speakerUid);
  const isCurrentSpeaker = speakerUid !== null && speakerUid === uid;
  const speakerDraftView = useSpeakerDraft(sessionId, isCurrentSpeaker);

  if (!turnView.ready || !speakerDraftView.ready) {
    return <WaitingView label="Loading turn…" />;
  }

  const turn = turnView.turn ?? {};
  const speakerDraft = speakerDraftView.draft ?? {};
  const isSpeaker = turn.speaker_uid === uid;
  const isListener = turn.listener_uid === uid;

  if (!isSpeaker && !isListener) {
    return <WaitingView label="Waiting for the session to assign roles." />;
  }

  const delivered = turn.delivered?.text;
  const mirrorText = turn.mirror?.text;
  const translationPending =
    speakerDraft.committed === true && !turn.translation;
  const reviewing = !!turn.translation && turn.translation.approved !== true;

  if (delivered && mirrorText) {
    return isSpeaker ? (
      <SpeakerConfirmationView
        sessionId={sessionId}
        deliveredText={delivered}
        mirrorText={mirrorText}
      />
    ) : (
      <WaitingView label="Your partner is reviewing your reflection." />
    );
  }

  if (delivered) {
    return isSpeaker ? (
      <SpeakerPostDeliveryView sessionId={sessionId} text={delivered} />
    ) : (
      <ListenerMirrorView
        sessionId={sessionId}
        deliveredText={delivered}
        retryHint={turn.retry_hint ?? null}
      />
    );
  }

  if (isSpeaker) {
    if (reviewing) {
      return (
        <TranslatorReviewView
          sessionId={sessionId}
          translation={turn.translation!}
          rawText={speakerDraft.raw ?? ''}
        />
      );
    }
    if (translationPending) {
      return <WaitingView label="Reviewing your message…" />;
    }
    return (
      <ComposeView
        sessionId={sessionId}
        topic={topic}
        initialText={speakerDraft.raw ?? ''}
        moderatorWarning={deriveSpeakerWarning(latestFlag)}
        showResources={showResourcesForFlag(latestFlag)}
      />
    );
  }

  return <WaitingView label="Your partner is composing. Hang tight." />;
}

// --- ComposeView (speaker) -------------------------------------------

function ComposeView({
  sessionId,
  topic,
  initialText,
  moderatorWarning,
  showResources,
}: {
  sessionId: string;
  topic: string;
  initialText: string;
  moderatorWarning: string | null;
  showResources: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      await set(ref(fb.database, `sessions/${sessionId}/speaker_draft`), {
        raw: trimmed,
        committed: true,
        submitted_at: Date.now(),
      });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Your turn">
      <p className={styles.stepLabel}>Step 2 — Your turn</p>
      <h2 className={styles.heading}>Speak to the topic</h2>
      {topic ? (
        <div className={styles.topicContext}>
          <p className={styles.topicContextLabel}>Talking about</p>
          <p className={styles.topicContextText}>{topic}</p>
        </div>
      ) : null}
      <p className={styles.paragraph}>
        Say what&apos;s on your mind. We&apos;ll suggest a softened version
        before your partner sees it — you decide what to send.
      </p>
      {moderatorWarning ? <WarningBanner text={moderatorWarning} /> : null}
      {showResources ? (
        <Link to="/resources" className={styles.cueLink}>
          If you or someone you love needs to talk to a person, tap here to see
          support resources.
        </Link>
      ) : null}
      <form onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind…"
          className={styles.composeInput}
          disabled={busy}
          maxLength={2000}
          rows={7}
          autoFocus
        />
        {error ? <ErrorBanner text={error} /> : null}
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={text.trim().length === 0}
        >
          Continue
        </Button>
      </form>
      <BreakButton sessionId={sessionId} />
    </AppShell>
  );
}

// --- TranslatorReviewView (speaker) ----------------------------------

function TranslatorReviewView({
  sessionId,
  translation,
  rawText,
}: {
  sessionId: string;
  translation: NonNullable<CurrentTurn['translation']>;
  rawText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (
    decision: 'send_softened' | 'send_original' | 'edit',
  ) => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; decision: string },
        { ok: true }
      >(getFunctions(fb.app), 'decideTranslation');
      await fn({ session_id: sessionId, decision });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (translation.already_soft) {
    return (
      <AppShell title="Ready to send">
        <h2 className={styles.heading}>Looks good as-is</h2>
        {translation.moderator_tier === 'tier_2' ? (
          <WarningBanner
            text={
              translation.moderator_suggestion ??
              'We picked up some heat in your wording. Take a beat to read it back before sending.'
            }
          />
        ) : null}
        <p className={styles.paragraph}>
          Your message is already in the form we&apos;d suggest.
        </p>
        <div className={styles.translationBox}>
          <p className={styles.translationText}>{rawText}</p>
        </div>
        {error ? <ErrorBanner text={error} /> : null}
        <Button
          variant="primary"
          onClick={() => decide('send_original')}
          busy={busy}
        >
          Send to partner
        </Button>
        <Button
          variant="secondary"
          onClick={() => decide('edit')}
          disabled={busy}
        >
          Edit first
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell title="Suggested wording">
      <h2 className={styles.heading}>Suggested wording</h2>
      {translation.moderator_tier === 'tier_2' ? (
        <WarningBanner
          text={
            translation.moderator_suggestion ??
            'This came across with some heat. The suggested wording aims for the same point in a way that lands easier.'
          }
        />
      ) : null}
      {translation.cannot_soften ? (
        <p className={styles.paragraph}>
          {translation.changes_made ||
            "We couldn't generate a softened version. You can still send the original."}
        </p>
      ) : null}

      <p className={styles.smallLabel}>Suggested</p>
      <div className={styles.translationBox}>
        <p className={styles.translationText}>{translation.softened}</p>
      </div>

      <p className={styles.smallLabel}>Your original</p>
      <div
        className={[styles.translationBox, styles.translationBoxMuted].join(
          ' ',
        )}
      >
        <p className={styles.translationText}>{rawText}</p>
      </div>

      {translation.changes_made && !translation.cannot_soften ? (
        <p className={styles.helper}>{translation.changes_made}</p>
      ) : null}

      {error ? <ErrorBanner text={error} /> : null}

      <Button
        variant="primary"
        onClick={() => decide('send_softened')}
        busy={busy}
        disabled={translation.cannot_soften === true}
      >
        Send suggested
      </Button>
      <Button
        variant="secondary"
        onClick={() => decide('edit')}
        disabled={busy}
      >
        Edit
      </Button>
      <Button
        variant="secondary"
        onClick={() => decide('send_original')}
        disabled={busy}
      >
        Send original
      </Button>
    </AppShell>
  );
}

// --- SpeakerPostDeliveryView ----------------------------------------

function SpeakerPostDeliveryView({
  sessionId,
  text,
}: {
  sessionId: string;
  text: string;
}) {
  return (
    <AppShell title="Sent">
      <h2 className={styles.heading}>Sent</h2>
      <p className={styles.paragraph}>
        Your partner is reflecting on your message.
      </p>
      <div className={styles.translationBox}>
        <p className={styles.translationText}>{text}</p>
      </div>
      <div className={styles.center}>
        <div className={styles.spinner} aria-hidden />
      </div>
      <BreakButton sessionId={sessionId} />
    </AppShell>
  );
}

// --- ListenerMirrorView ---------------------------------------------

function ListenerMirrorView({
  sessionId,
  deliveredText,
  retryHint,
}: {
  sessionId: string;
  deliveredText: string;
  retryHint: string | null;
}) {
  const [content, setContent] = useState('');
  const [feeling, setFeeling] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    const trimmedFeeling = feeling.trim();
    if (trimmedContent.length === 0 || trimmedFeeling.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const text = `${trimmedContent}\n\nIt sounded like you felt: ${trimmedFeeling}`;
      // Write directly to /mirror — that's the exact path the security
      // rule grants the listener during IN_TURN. Updating the parent
      // current_turn would touch retry_hint too, which has no client
      // write rule and would default-deny the multi-path update.
      await set(ref(fb.database, `sessions/${sessionId}/current_turn/mirror`), {
        text,
        submitted_at: Date.now(),
      });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Your turn to reflect">
      <p className={styles.stepLabel}>Your turn to reflect</p>
      <h2 className={styles.heading}>Reflect back what you heard</h2>
      <p className={styles.paragraph}>
        Just paraphrase — your response comes after they feel heard.
      </p>
      {retryHint ? (
        <WarningBanner text={`Hint from speaker: ${retryHint}`} />
      ) : null}
      <p className={styles.smallLabel}>They said</p>
      <div className={styles.translationBox}>
        <p className={styles.translationText}>{deliveredText}</p>
      </div>
      <form onSubmit={submit}>
        <p className={styles.smallLabel}>What you heard them say</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="In your own words…"
          className={styles.composeInput}
          disabled={busy}
          maxLength={1000}
          rows={5}
        />
        <p className={styles.smallLabel}>What they were feeling</p>
        <textarea
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          placeholder="A feeling word or two…"
          className={styles.feelingInput}
          disabled={busy}
          maxLength={300}
          rows={2}
        />
        {error ? <ErrorBanner text={error} /> : null}
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={content.trim().length === 0 || feeling.trim().length === 0}
        >
          Reflect back
        </Button>
      </form>
      <BreakButton sessionId={sessionId} />
    </AppShell>
  );
}

// --- SpeakerConfirmationView ----------------------------------------

function SpeakerConfirmationView({
  sessionId,
  deliveredText,
  mirrorText,
}: {
  sessionId: string;
  deliveredText: string;
  mirrorText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintField, setHintField] = useState<'mostly' | 'retry' | null>(null);
  const [hint, setHint] = useState('');

  const confirm = async (
    status: 'heard' | 'more' | 'retry',
    hintText?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; status: string; hint?: string },
        { ok: true }
      >(getFunctions(fb.app), 'confirmTurn');
      await fn({
        session_id: sessionId,
        status,
        hint: hintText && hintText.trim().length > 0 ? hintText : undefined,
      });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Did you feel heard?">
      <h2 className={styles.heading}>Did you feel heard?</h2>
      <p className={styles.smallLabel}>You said</p>
      <div
        className={[styles.translationBox, styles.translationBoxMuted].join(
          ' ',
        )}
      >
        <p className={styles.translationText}>{deliveredText}</p>
      </div>
      <p className={styles.smallLabel}>They reflected</p>
      <div className={styles.translationBox}>
        <p className={styles.translationText}>{mirrorText}</p>
      </div>

      {error ? <ErrorBanner text={error} /> : null}

      {hintField === null ? (
        <div className={styles.buttonColumn}>
          <Button
            variant="primary"
            onClick={() => confirm('heard')}
            busy={busy}
          >
            Yes
          </Button>
          <Button
            variant="secondary"
            onClick={() => setHintField('mostly')}
            disabled={busy}
          >
            Mostly
          </Button>
          <Button
            variant="secondary"
            onClick={() => confirm('more')}
            disabled={busy}
          >
            Let me say more
          </Button>
          <Button
            variant="secondary"
            onClick={() => setHintField('retry')}
            disabled={busy}
          >
            Could you try again?
          </Button>
        </div>
      ) : (
        <div className={styles.hintBlock}>
          <p className={styles.smallLabel}>
            {hintField === 'mostly'
              ? 'Anything you want to flag (optional)'
              : 'A hint for them (optional)'}
          </p>
          <textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={
              hintField === 'mostly'
                ? "What didn't quite land…"
                : 'What you wish they had captured…'
            }
            className={styles.feelingInput}
            disabled={busy}
            maxLength={500}
            rows={3}
          />
          <div className={styles.buttonColumn}>
            <Button
              variant="primary"
              onClick={() =>
                confirm(hintField === 'mostly' ? 'heard' : 'retry', hint)
              }
              busy={busy}
            >
              {hintField === 'mostly' ? 'Move on' : 'Ask for another try'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setHintField(null);
                setHint('');
              }}
              disabled={busy}
            >
              Back
            </Button>
          </div>
        </div>
      )}
      <BreakButton sessionId={sessionId} />
    </AppShell>
  );
}

// --- FloorSwapView --------------------------------------------------

function FloorSwapView({ sessionId, uid }: { sessionId: string; uid: string }) {
  const turnView = useCurrentTurn(sessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!turnView.ready) {
    return <WaitingView label="Loading…" />;
  }

  const turn = turnView.turn ?? {};
  const summary = turn.floor_swap_summary;
  const alreadyAcked = turn.swap_acks?.[uid] === true;
  const alreadyEndAcked = turn.end_acks?.[uid] === true;
  const otherUid =
    summary?.prev_speaker_uid === uid
      ? summary?.prev_listener_uid
      : summary?.prev_speaker_uid;
  const partnerEndAcked = otherUid ? turn.end_acks?.[otherUid] === true : false;
  const isNextSpeaker = turn.speaker_uid === uid;

  const callable = async (name: 'ackFloorSwap' | 'requestSessionEnd') => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        name,
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel = alreadyAcked
    ? 'Waiting for your partner…'
    : 'Ready to continue';

  const endLabel = alreadyEndAcked
    ? 'Waiting for partner to also end…'
    : 'End the session';

  return (
    <AppShell title="Floor swap">
      <p className={styles.stepLabel}>Floor swap</p>
      <h2 className={styles.heading}>
        {isNextSpeaker ? "It's your turn next" : 'Listening next'}
      </h2>
      <p className={styles.paragraph}>
        Take a breath before continuing. Here&apos;s what just happened:
      </p>
      {summary?.delivered_text ? (
        <>
          <p className={styles.smallLabel}>
            {summary.prev_speaker_uid === uid ? 'You said' : 'They said'}
          </p>
          <div
            className={[styles.translationBox, styles.translationBoxMuted].join(
              ' ',
            )}
          >
            <p className={styles.translationText}>{summary.delivered_text}</p>
          </div>
        </>
      ) : null}
      {summary?.mirror_text ? (
        <>
          <p className={styles.smallLabel}>
            {summary.prev_listener_uid === uid
              ? 'You reflected'
              : 'They reflected'}
          </p>
          <div className={styles.translationBox}>
            <p className={styles.translationText}>{summary.mirror_text}</p>
          </div>
        </>
      ) : null}
      {partnerEndAcked && !alreadyEndAcked ? (
        <CueBanner text='Your partner wants to end the session. Tap "End the session" to agree, or "Ready to continue" to keep going.' />
      ) : null}
      {error ? <ErrorBanner text={error} /> : null}
      <Button
        variant="primary"
        onClick={() => callable('ackFloorSwap')}
        busy={busy}
        disabled={alreadyAcked}
      >
        {primaryLabel}
      </Button>
      <Button
        variant="secondary"
        onClick={() => callable('requestSessionEnd')}
        disabled={busy || alreadyEndAcked}
      >
        {endLabel}
      </Button>
      <BreakButton sessionId={sessionId} />
    </AppShell>
  );
}

// --- WrapUpView -----------------------------------------------------

function WrapUpView({
  sessionId,
  uid,
  partnerAUid,
  partnerUid,
}: {
  sessionId: string;
  uid: string;
  partnerAUid: string;
  partnerUid: string | null;
}) {
  const navigate = useNavigate();
  const summaryView = useSummary(sessionId);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [appreciationText, setAppreciationText] = useState('');
  const [appreciationBusy, setAppreciationBusy] = useState(false);
  const [appreciationSent, setAppreciationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!summaryView.ready) {
    return <WaitingView label="Loading summary…" />;
  }

  const summary = summaryView.summary;
  const summariesReady =
    !!summary?.partner_a_summary && !!summary?.partner_b_summary;

  if (!summariesReady) {
    return <WaitingView label="Putting together what each of you said…" />;
  }

  const isPartnerA = uid === partnerAUid;
  const ownSummary =
    (isPartnerA ? summary.partner_a_summary : summary.partner_b_summary) ?? '';
  const partnerSummary =
    (isPartnerA ? summary.partner_b_summary : summary.partner_a_summary) ?? '';
  const ownConfirmed = isPartnerA
    ? summary.partner_a_confirmed === true
    : summary.partner_b_confirmed === true;
  const partnerConfirmed = isPartnerA
    ? summary.partner_b_confirmed === true
    : summary.partner_a_confirmed === true;
  const nextAction = summary.next_action ?? null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const field = isPartnerA ? 'partner_a_confirmed' : 'partner_b_confirmed';
      await set(
        ref(fb.database, `sessions/${sessionId}/summary/${field}`),
        true,
      );
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setEditText(ownSummary);
    setEditing(true);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = editText.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; text: string },
        { ok: true }
      >(getFunctions(fb.app), 'adjustSummary');
      await fn({ session_id: sessionId, text: trimmed });
      setEditing(false);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const setNextAction = async (action: NextAction) => {
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const newVal = nextAction === action ? null : action;
      await set(
        ref(fb.database, `sessions/${sessionId}/summary/next_action`),
        newVal,
      );
    } catch (err) {
      setError(readableError(err));
    }
  };

  const sendAppreciation = async () => {
    const trimmed = appreciationText.trim();
    if (trimmed.length === 0 || !partnerUid) return;
    setAppreciationBusy(true);
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const feedRef = ref(fb.database, `appreciation_feed/${partnerUid}`);
      const entryRef = push(feedRef);
      await set(entryRef, {
        from_uid: uid,
        content: trimmed,
        tags: ['from_session_wrap_up'],
        created_at: Date.now(),
      });
      setAppreciationSent(true);
      setAppreciationText('');
    } catch (err) {
      setError(readableError(err));
    } finally {
      setAppreciationBusy(false);
    }
  };

  const nextActionOptions: [NextAction, string][] = [
    ['leave', 'Leave it here for now'],
    ['schedule_solving', 'Schedule problem-solving for this'],
    ['add_to_perpetual', 'Add to our recurring topics'],
  ];

  return (
    <AppShell title="Wrap-up">
      <p className={styles.stepLabel}>Wrap-up</p>
      <h2 className={styles.heading}>Here&apos;s what I heard you both say</h2>

      {partnerConfirmed && !ownConfirmed ? (
        <CueBanner text="Your partner felt their summary captures it. Confirm yours when you're ready to wrap up." />
      ) : null}

      {error ? <ErrorBanner text={error} /> : null}

      <p className={styles.smallLabel}>Your story</p>
      {editing ? (
        <form onSubmit={saveEdit}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className={styles.composeInput}
            disabled={busy}
            maxLength={2000}
            rows={7}
          />
          <div className={styles.buttonColumn}>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={editText.trim().length === 0}
            >
              Save my version
            </Button>
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={styles.translationBox}>
            <p className={styles.translationText}>{ownSummary}</p>
          </div>
          <Button
            variant="primary"
            onClick={confirm}
            busy={busy}
            disabled={ownConfirmed}
          >
            {ownConfirmed
              ? partnerConfirmed
                ? 'Confirmed — wrapping up…'
                : 'Confirmed — waiting for your partner'
              : 'This captures it'}
          </Button>
          {!ownConfirmed ? (
            <Button variant="secondary" onClick={startEdit} disabled={busy}>
              Let me adjust
            </Button>
          ) : null}
        </>
      )}

      <p className={[styles.smallLabel, styles.smallLabelTop].join(' ')}>
        Their story
      </p>
      <div
        className={[styles.translationBox, styles.translationBoxMuted].join(
          ' ',
        )}
      >
        <p className={styles.translationText}>{partnerSummary}</p>
      </div>
      <p className={styles.helper}>
        {partnerConfirmed
          ? 'Your partner has confirmed their summary.'
          : 'Your partner is reviewing their summary.'}
      </p>

      {partnerUid ? (
        <>
          <p className={[styles.smallLabel, styles.smallLabelTop].join(' ')}>
            One thing you appreciated (optional)
          </p>
          <p className={styles.helperLeft}>
            Small, specific things land the best. Skip it if nothing&apos;s
            coming to mind.
          </p>
          {appreciationSent ? (
            <p className={styles.helperLeft}>
              Sent. Your partner will see it on their feed.
            </p>
          ) : (
            <>
              <textarea
                value={appreciationText}
                onChange={(e) => setAppreciationText(e.target.value)}
                placeholder="Something specific about how they showed up…"
                className={styles.feelingInput}
                disabled={appreciationBusy}
                maxLength={500}
                rows={3}
              />
              <Button
                variant="secondary"
                onClick={sendAppreciation}
                busy={appreciationBusy}
                disabled={appreciationText.trim().length === 0}
              >
                Send appreciation
              </Button>
            </>
          )}
        </>
      ) : null}

      <p className={[styles.smallLabel, styles.smallLabelTop].join(' ')}>
        What&apos;s next?
      </p>
      <p className={styles.helperLeft}>
        Pick what fits — both of you can suggest. Tapping again unselects.
      </p>
      <div className={styles.tagRow}>
        {nextActionOptions.map(([value, label]) => {
          const active = nextAction === value;
          return (
            <button
              key={value}
              type="button"
              className={[styles.tag, active ? styles.tagActive : ''].join(' ')}
              onClick={() => void setNextAction(value)}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.subtleButton}
        onClick={() => navigate('/')}
      >
        Back to home
      </button>
    </AppShell>
  );
}

// --- Shared banners / helpers ----------------------------------------

function WarningBanner({ text }: { text: string }) {
  return (
    <div className={styles.warning} role="alert">
      {text}
    </div>
  );
}

function CueBanner({ text }: { text: string }) {
  return <div className={styles.cue}>{text}</div>;
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className={styles.errorBanner} role="alert">
      {text}
    </div>
  );
}

interface ModeratorFlag {
  type?: string;
  severity?: number;
  target_uid?: string | null;
  created_at?: number;
  reason?: string | null;
  suggestion?: string | null;
  escalated?: boolean;
  show_resources?: boolean;
}

// Subscribes to /sessions/{sid}/flags and returns the most recent flag
// whose target_uid matches the speaker. Powers the compose-side
// warning that surfaces tier_3 blocks and disclosure cues.
function useLatestSpeakerFlag(
  sessionId: string,
  speakerUid: string | null,
): ModeratorFlag | null {
  const [flag, setFlag] = useState<ModeratorFlag | null>(null);

  useEffect(() => {
    if (!speakerUid) {
      setFlag(null);
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) return;
    const r = ref(fb.database, `sessions/${sessionId}/flags`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as Record<string, ModeratorFlag> | null;
      if (!val) {
        setFlag(null);
        return;
      }
      let latest: ModeratorFlag | null = null;
      for (const entry of Object.values(val)) {
        if (entry.target_uid !== speakerUid) continue;
        if (!latest || (entry.created_at ?? 0) > (latest.created_at ?? 0)) {
          latest = entry;
        }
      }
      setFlag(latest);
    };
    onValue(r, handler, () => setFlag(null));
    return () => off(r, 'value', handler);
  }, [sessionId, speakerUid]);

  return flag;
}

function showResourcesForFlag(flag: ModeratorFlag | null): boolean {
  if (!flag || !flag.created_at) return false;
  if (Date.now() - flag.created_at > 5 * 60_000) return false;
  return flag.show_resources === true || flag.type === 'disclosure';
}

function deriveSpeakerWarning(flag: ModeratorFlag | null): string | null {
  if (!flag || !flag.created_at) return null;
  if (Date.now() - flag.created_at > 5 * 60_000) return null;
  if (flag.type === 'disclosure') return null;
  if (flag.suggestion && flag.suggestion.length > 0) return flag.suggestion;
  if (flag.reason && flag.reason.length > 0) return flag.reason;
  if (flag.type === 'harsh_startup') {
    return 'That came across pretty hot. Try saying what you need or feel, not what your partner is doing wrong.';
  }
  return 'Try a softer phrasing before sending.';
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
