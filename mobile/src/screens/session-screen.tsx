import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getDatabase,
  off,
  onDisconnect,
  onValue,
  ref,
  set,
} from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { tryInitFirebase } from '../firebase';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { useCurrentTurn, type CurrentTurn } from '../hooks/use-current-turn';
import { useSession, type SessionMeta } from '../hooks/use-session';
import { useSummary } from '../hooks/use-summary';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Session'>;

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

export default function SessionScreen() {
  const route = useRoute<Route>();
  const sessionId = route.params.sessionId;
  const auth = useAuthState();
  const uid = currentUid(auth);
  const session = useSession(sessionId);

  // Mark the local user as present in this session while mounted, so
  // the partner's Home screen can auto-flip them in too. onDisconnect
  // covers app crashes / network drops; the explicit set(false) on
  // unmount covers clean Back-presses.
  useEffect(() => {
    if (!uid) return;
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

  if (!session.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session.meta === null) {
    return <StaleSessionView sessionId={sessionId} />;
  }

  if (uid === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.paragraph}>Sign-in needed.</Text>
      </View>
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
    case 'WRAP_UP':
      return (
        <WrapUpView
          sessionId={sessionId}
          uid={uid}
          partnerAUid={meta.partnerA}
        />
      );
    case 'ENDED':
      return (
        <PlaceholderView
          title="Session ended"
          body="This session is complete."
        />
      );
    default:
      return (
        <PlaceholderView
          title={meta.state}
          body="Unhandled state — see docs/06."
        />
      );
  }
}

// Session deleted server-side or pointer is stale. Auto-clears the
// active_session_id pointers via clearStaleSession and routes home so
// the user doesn't loop "Resume → not found → Back → Resume".
function StaleSessionView({ sessionId }: { sessionId: string }) {
  const navigation = useNavigation<Nav>();

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
        if (!cancelled) navigation.popToTop();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigation]);

  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={[styles.paragraph, { marginTop: 16 }]}>
        Session no longer available. Returning home…
      </Text>
    </View>
  );
}

// CHECK_IN
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

  const submit = async () => {
    if (score === null) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      // Direct RTDB write — checkins are uid-private and rules
      // restrict to state===CHECK_IN. Server-side trigger advances
      // the session state when both partners are ready.
      const db = getDatabase(fb.app);
      await set(ref(db, `sessions/${sessionId}/checkins/${uid}`), {
        flooding_score: score,
        ready: true,
        submitted_at: Date.now(),
      });
    } catch (err) {
      Alert.alert('Could not submit', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Quick check-in</Text>
      {partnerReady ? (
        <View style={styles.partnerStatus}>
          <Text style={styles.partnerStatusLabel}>Your partner is ready.</Text>
        </View>
      ) : null}
      <Text style={styles.paragraph}>
        How activated are you right now? 1 means calm and grounded; 10 means
        overwhelmed.
      </Text>
      <View style={styles.scoreRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <Pressable
            key={n}
            style={[
              styles.scoreButton,
              score === n && styles.scoreButtonSelected,
            ]}
            onPress={() => setScore(n)}
            accessibilityRole="button"
            accessibilityLabel={`Score ${n}`}
          >
            <Text
              style={[
                styles.scoreLabel,
                score === n && styles.scoreLabelSelected,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[
          styles.primaryButton,
          (busy || score === null) && styles.disabledButton,
        ]}
        disabled={busy || score === null}
        onPress={submit}
      >
        <Text style={styles.primaryLabel}>
          {busy ? 'Submitting…' : "I'm ready"}
        </Text>
      </Pressable>
      <Text style={styles.helper}>
        Your score stays private to you. We only use it to decide whether to
        start now or take a breather first.
      </Text>
    </ScrollView>
  );
}

// TOPIC_INTAKE (raiser only)
function TopicIntakeView({ sessionId }: { sessionId: string }) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = topic.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; topic: string },
        { ok: true }
      >(getFunctions(fb.app), 'proposeTopic');
      await fn({ session_id: sessionId, topic: trimmed });
    } catch (err) {
      Alert.alert('Could not submit topic', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Step 1 — Pick a topic</Text>
      <Text style={styles.heading}>What would you like to talk about?</Text>
      <Text style={styles.paragraph}>
        Just the headline, in one sentence — not your full thoughts. Your
        partner will accept it or ask you to reframe before either of you starts
        speaking.
      </Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        placeholder="e.g. how we split chores on weekends"
        multiline
        style={styles.topicInput}
        editable={!busy}
        maxLength={500}
      />
      <Pressable
        style={[
          styles.primaryButton,
          (busy || topic.trim().length === 0) && styles.disabledButton,
        ]}
        disabled={busy || topic.trim().length === 0}
        onPress={submit}
      >
        <Text style={styles.primaryLabel}>
          {busy ? 'Sending…' : 'Send topic to partner'}
        </Text>
      </Pressable>
      <Text style={styles.helper}>
        We'll moderate your actual statements once the conversation starts.
      </Text>
    </ScrollView>
  );
}

// TOPIC_AGREE (responder only)
function TopicAgreeView({
  sessionId,
  topic,
}: {
  sessionId: string;
  topic: string;
}) {
  const [busy, setBusy] = useState(false);

  const call = async (which: 'acceptTopic' | 'reframeTopic') => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        which,
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      Alert.alert('Could not respond', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Your partner suggests:</Text>
      <View style={styles.topicBox}>
        <Text style={styles.topicText}>{topic}</Text>
      </View>
      <Pressable
        style={[styles.primaryButton, busy && styles.disabledButton]}
        disabled={busy}
        onPress={() => call('acceptTopic')}
      >
        <Text style={styles.primaryLabel}>That works — let's start</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, busy && styles.disabledButton]}
        disabled={busy}
        onPress={() => call('reframeTopic')}
      >
        <Text style={styles.secondaryLabel}>Ask to reframe</Text>
      </Pressable>
    </ScrollView>
  );
}

// PAUSED. Live countdown to meta.paused_until + per-partner "Continue
// session" ack. While timer is running the resume button is disabled;
// after it hits zero, either partner can tap Continue. Both must tap
// before the server transitions back to state_before_pause. A small
// "Skip the wait" override lets the pair bypass the timer (with
// confirmation) per docs/04 § Pause/cooldown.
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
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

  const callResume = async () => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        'resumeFromPause',
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      Alert.alert('Could not resume', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const onContinue = () => {
    if (selfAcked) return;
    void callResume();
  };

  const onSkipWait = () => {
    if (selfAcked) return;
    Alert.alert(
      'Skip the wait?',
      'The 20-minute window helps the body settle. Both of you would need to tap continue to resume early.',
      [
        { text: 'Keep waiting', style: 'cancel' },
        { text: "I'm ready now", onPress: () => void callResume() },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Cooldown</Text>
      <Text style={styles.heading}>Take a breather</Text>
      <Text style={styles.paragraph}>
        The session is paused. Twenty minutes lets the body settle so you both
        come back grounded.
      </Text>
      <View style={styles.timerBox}>
        <Text style={styles.timerLabel}>
          {timerExpired ? 'Ready when you both are' : countdownText}
        </Text>
      </View>
      <Pressable
        style={[
          styles.primaryButton,
          (busy || selfAcked || !timerExpired) && styles.disabledButton,
        ]}
        disabled={busy || selfAcked || !timerExpired}
        onPress={onContinue}
      >
        <Text style={styles.primaryLabel}>
          {selfAcked
            ? partnerAcked
              ? 'Resuming…'
              : 'Waiting for your partner'
            : busy
              ? 'Sending…'
              : 'Continue session'}
        </Text>
      </Pressable>
      {!timerExpired && !selfAcked ? (
        <Pressable
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          disabled={busy}
          onPress={onSkipWait}
        >
          <Text style={styles.secondaryLabel}>Skip the wait</Text>
        </Pressable>
      ) : null}
      {meta.pause_reason && meta.pause_reason !== 'manual_break' ? (
        <Text style={styles.helper}>Reason: {meta.pause_reason}</Text>
      ) : null}
    </ScrollView>
  );
}

// Generic placeholder for states with no UI yet
function PlaceholderView({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.paragraph}>{body}</Text>
    </View>
  );
}

function WaitingView({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={[styles.paragraph, { marginTop: 16 }]}>{label}</Text>
    </View>
  );
}

// Shared "I need a break" affordance for active conversation screens.
// Confirms before pausing because pausing mid-conversation is a heavy
// action that affects both partners. Calls requestPause; the resulting
// PAUSED state transition shows up via the meta listener so the screen
// flips to PausedView automatically.
function BreakButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);

  const requestPause = async () => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        'requestPause',
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      Alert.alert('Could not pause', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    Alert.alert(
      'Take a break?',
      "We'll pause the session for 20 minutes. Both of you will need to tap continue to come back.",
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Pause for 20 min', onPress: () => void requestPause() },
      ],
    );
  };

  return (
    <Pressable
      style={[styles.subtleButton, busy && styles.disabledButton]}
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="I need a break"
    >
      <Text style={styles.subtleLabel}>I need a break</Text>
    </Pressable>
  );
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

// IN_TURN router. Routes by speaker/listener role + sub-state derived
// from current_turn (speaker_draft, translation, delivered).
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

  if (!turnView.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const turn = turnView.turn ?? {};
  const isSpeaker = turn.speaker_uid === uid;
  const isListener = turn.listener_uid === uid;

  if (!isSpeaker && !isListener) {
    return (
      <PlaceholderView
        title="Joining…"
        body="Waiting for the session to assign roles."
      />
    );
  }

  // Sub-state derivation. Order matters:
  //   delivered + mirror present →
  //     speaker: confirmation; listener: waiting (partner reviewing)
  //   delivered, no mirror →
  //     speaker: post-delivery wait; listener: mirror
  //   translation && !approved → translator review (speaker)
  //   committed && !translation → translating spinner (speaker)
  //   else → compose (speaker) / waiting (listener)
  const delivered = turn.delivered?.text;
  const mirrorText = turn.mirror?.text;
  const translationPending =
    turn.speaker_draft?.committed === true && !turn.translation;
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
      <SpeakerPostDeliveryView text={delivered} />
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
          rawText={turn.speaker_draft?.raw ?? ''}
        />
      );
    }
    if (translationPending) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.paragraph, { marginTop: 16 }]}>
            Reviewing your message…
          </Text>
        </View>
      );
    }
    return (
      <ComposeView
        sessionId={sessionId}
        topic={topic}
        initialText={turn.speaker_draft?.raw ?? ''}
        moderatorWarning={deriveSpeakerWarning(latestFlag)}
      />
    );
  }

  // Listener side. Until delivered exists, just show a calm waiting
  // indicator — no detail leaks about composition activity beyond
  // the fact that the partner is composing.
  return <WaitingView label="Your partner is composing. Hang tight." />;
}

function ComposeView({
  sessionId,
  topic,
  initialText,
  moderatorWarning,
}: {
  sessionId: string;
  topic: string;
  initialText: string;
  moderatorWarning: string | null;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const db = getDatabase(fb.app);
      // Single atomic write of raw + committed so the trigger sees
      // both fields together.
      await set(ref(db, `sessions/${sessionId}/current_turn/speaker_draft`), {
        raw: trimmed,
        committed: true,
        submitted_at: Date.now(),
      });
    } catch (err) {
      Alert.alert('Could not send', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Step 2 — Your turn</Text>
      <Text style={styles.heading}>Speak to the topic</Text>
      {topic ? (
        <View style={styles.topicContext}>
          <Text style={styles.topicContextLabel}>Talking about</Text>
          <Text style={styles.topicContextText}>{topic}</Text>
        </View>
      ) : null}
      <Text style={styles.paragraph}>
        Say what's on your mind. We'll suggest a softened version before your
        partner sees it — you decide what to send.
      </Text>
      {moderatorWarning ? (
        <View style={styles.warning}>
          <Text style={styles.warningLabel}>{moderatorWarning}</Text>
        </View>
      ) : null}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What's on your mind…"
        multiline
        style={styles.composeInput}
        editable={!busy}
        maxLength={2000}
      />
      <Pressable
        style={[
          styles.primaryButton,
          (busy || text.trim().length === 0) && styles.disabledButton,
        ]}
        disabled={busy || text.trim().length === 0}
        onPress={submit}
      >
        <Text style={styles.primaryLabel}>
          {busy ? 'Sending…' : 'Continue'}
        </Text>
      </Pressable>
      <BreakButton sessionId={sessionId} />
    </ScrollView>
  );
}

interface ModeratorFlag {
  type?: string;
  severity?: number;
  target_uid?: string | null;
  created_at?: number;
}

// Subscribes to /sessions/{sid}/flags and returns the most recent
// flag whose target_uid matches the speaker. Used by ComposeView to
// surface tier_3 hard-block feedback after the speaker-draft trigger
// reverts a commit. Cheap: flags is a small list that grows by ~1
// per blocked attempt within a session.
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

// Show a warning if the latest flag is recent (< 5 minutes). The
// trigger writes the flag synchronously before reverting the commit,
// and ComposeView re-mounts immediately after — so the timestamp
// gives a robust "this attempt was just blocked" signal that fades
// naturally as the speaker takes longer to retry.
function deriveSpeakerWarning(flag: ModeratorFlag | null): string | null {
  if (!flag || !flag.created_at) return null;
  const ageMs = Date.now() - flag.created_at;
  if (ageMs > 5 * 60_000) return null;
  if (flag.type === 'harsh_startup') {
    return 'That came across pretty hot. Try saying what you need or feel, not what your partner is doing wrong.';
  }
  return 'Try a softer phrasing before sending.';
}

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

  const decide = async (
    decision: 'send_softened' | 'send_original' | 'edit',
  ) => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<
        { session_id: string; decision: string },
        { ok: true }
      >(getFunctions(fb.app), 'decideTranslation');
      await fn({ session_id: sessionId, decision });
    } catch (err) {
      Alert.alert('Could not continue', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  // If the translator says it's already softened, skip the comparison
  // — the speaker doesn't need to choose between two near-identical
  // strings. Single primary "Send" button.
  if (translation.already_soft) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Looks good as-is</Text>
        {translation.moderator_tier === 'tier_2' ? (
          <View style={styles.warning}>
            <Text style={styles.warningLabel}>
              We picked up some heat in your wording. Take a beat to read it
              back before sending.
            </Text>
          </View>
        ) : null}
        <Text style={styles.paragraph}>
          Your message is already in the form we'd suggest.
        </Text>
        <View style={styles.translationBox}>
          <Text style={styles.translationText}>{rawText}</Text>
        </View>
        <Pressable
          style={[styles.primaryButton, busy && styles.disabledButton]}
          disabled={busy}
          onPress={() => decide('send_original')}
        >
          <Text style={styles.primaryLabel}>
            {busy ? 'Sending…' : 'Send to partner'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          disabled={busy}
          onPress={() => decide('edit')}
        >
          <Text style={styles.secondaryLabel}>Edit first</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Suggested wording</Text>
      {translation.moderator_tier === 'tier_2' ? (
        <View style={styles.warning}>
          <Text style={styles.warningLabel}>
            This came across with some heat. The suggested wording aims for the
            same point in a way that lands easier.
          </Text>
        </View>
      ) : null}
      {translation.cannot_soften ? (
        <Text style={styles.paragraph}>
          {translation.changes_made ||
            "We couldn't generate a softened version. You can still send the original."}
        </Text>
      ) : null}

      <Text style={styles.smallLabel}>Suggested</Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{translation.softened}</Text>
      </View>

      <Text style={styles.smallLabel}>Your original</Text>
      <View style={[styles.translationBox, styles.translationBoxMuted]}>
        <Text style={styles.translationText}>{rawText}</Text>
      </View>

      {translation.changes_made && !translation.cannot_soften ? (
        <Text style={styles.helper}>{translation.changes_made}</Text>
      ) : null}

      <Pressable
        style={[
          styles.primaryButton,
          (busy || translation.cannot_soften) && styles.disabledButton,
        ]}
        disabled={busy || translation.cannot_soften === true}
        onPress={() => decide('send_softened')}
      >
        <Text style={styles.primaryLabel}>Send suggested</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, busy && styles.disabledButton]}
        disabled={busy}
        onPress={() => decide('edit')}
      >
        <Text style={styles.secondaryLabel}>Edit</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, busy && styles.disabledButton]}
        disabled={busy}
        onPress={() => decide('send_original')}
      >
        <Text style={styles.secondaryLabel}>Send original</Text>
      </Pressable>
    </ScrollView>
  );
}

// Speaker post-delivery: their message is on the wire and the listener
// is mirroring it. Calm waiting view, no detail about what the listener
// is typing.
function SpeakerPostDeliveryView({ text }: { text: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Sent</Text>
      <Text style={styles.paragraph}>
        Your partner is reflecting on your message.
      </Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{text}</Text>
      </View>
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    </ScrollView>
  );
}

// C6 — Listener mirror. Two fields: what they said + what they were
// feeling. On submit, concatenated and written to current_turn/mirror.
// docs/04 § Listener mirroring + docs/03 mirror schema.
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

  const submit = async () => {
    const trimmedContent = content.trim();
    const trimmedFeeling = feeling.trim();
    if (trimmedContent.length === 0 || trimmedFeeling.length === 0) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const text = `${trimmedContent}\n\nIt sounded like you felt: ${trimmedFeeling}`;
      // Write directly to /mirror — that's the path the security rule
      // grants the listener (`!data.exists()`, IN_TURN). Updating the
      // parent current_turn would also touch retry_hint, which has no
      // client write rule and would default-deny the whole multi-path
      // update. retry_hint is server-managed: confirmTurn sets it on
      // every retry and clears it on more / floor-swap, so we don't
      // need to touch it here.
      const db = getDatabase(fb.app);
      await set(ref(db, `sessions/${sessionId}/current_turn/mirror`), {
        text,
        submitted_at: Date.now(),
      });
    } catch (err) {
      Alert.alert('Could not send reflection', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Your turn to reflect</Text>
      <Text style={styles.heading}>Reflect back what you heard</Text>
      <Text style={styles.paragraph}>
        Just paraphrase — your response comes after they feel heard.
      </Text>
      {retryHint ? (
        <View style={styles.warning}>
          <Text style={styles.warningLabel}>
            Hint from speaker: {retryHint}
          </Text>
        </View>
      ) : null}
      <Text style={styles.smallLabel}>They said</Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{deliveredText}</Text>
      </View>
      <Text style={styles.smallLabel}>What you heard them say</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="In your own words…"
        multiline
        style={styles.composeInput}
        editable={!busy}
        maxLength={1000}
      />
      <Text style={styles.smallLabel}>What they were feeling</Text>
      <TextInput
        value={feeling}
        onChangeText={setFeeling}
        placeholder="A feeling word or two…"
        multiline
        style={styles.feelingInput}
        editable={!busy}
        maxLength={300}
      />
      <Pressable
        style={[
          styles.primaryButton,
          (busy ||
            content.trim().length === 0 ||
            feeling.trim().length === 0) &&
            styles.disabledButton,
        ]}
        disabled={
          busy || content.trim().length === 0 || feeling.trim().length === 0
        }
        onPress={submit}
      >
        <Text style={styles.primaryLabel}>
          {busy ? 'Sending…' : 'Reflect back'}
        </Text>
      </Pressable>
      <BreakButton sessionId={sessionId} />
    </ScrollView>
  );
}

// C7 — Speaker confirmation. After the listener mirrors, the speaker
// indicates whether they felt heard. Four options per docs/04:
//   Yes / Mostly       → status='heard' (mostly carries optional hint)
//   Let me say more    → status='more'
//   Could you try again → status='retry' (carries optional hint)
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
  const [hintField, setHintField] = useState<'mostly' | 'retry' | null>(null);
  const [hint, setHint] = useState('');

  const confirm = async (
    status: 'heard' | 'more' | 'retry',
    hintText?: string,
  ) => {
    setBusy(true);
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
      Alert.alert('Could not continue', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Did you feel heard?</Text>
      <Text style={styles.smallLabel}>You said</Text>
      <View style={[styles.translationBox, styles.translationBoxMuted]}>
        <Text style={styles.translationText}>{deliveredText}</Text>
      </View>
      <Text style={styles.smallLabel}>They reflected</Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{mirrorText}</Text>
      </View>

      {hintField === null ? (
        <>
          <Pressable
            style={[styles.primaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => confirm('heard')}
          >
            <Text style={styles.primaryLabel}>Yes</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => setHintField('mostly')}
          >
            <Text style={styles.secondaryLabel}>Mostly</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => confirm('more')}
          >
            <Text style={styles.secondaryLabel}>Let me say more</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => setHintField('retry')}
          >
            <Text style={styles.secondaryLabel}>Could you try again?</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.smallLabel}>
            {hintField === 'mostly'
              ? 'Anything you want to flag (optional)'
              : 'A hint for them (optional)'}
          </Text>
          <TextInput
            value={hint}
            onChangeText={setHint}
            placeholder={
              hintField === 'mostly'
                ? "What didn't quite land…"
                : 'What you wish they had captured…'
            }
            multiline
            style={styles.feelingInput}
            editable={!busy}
            maxLength={500}
          />
          <Pressable
            style={[styles.primaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() =>
              confirm(hintField === 'mostly' ? 'heard' : 'retry', hint)
            }
          >
            <Text style={styles.primaryLabel}>
              {busy
                ? 'Sending…'
                : hintField === 'mostly'
                  ? 'Move on'
                  : 'Ask for another try'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => {
              setHintField(null);
              setHint('');
            }}
          >
            <Text style={styles.secondaryLabel}>Back</Text>
          </Pressable>
        </>
      )}
      <BreakButton sessionId={sessionId} />
    </ScrollView>
  );
}

// C8 — Floor swap. Both partners see the prior turn's delivered + mirror
// text and a "Ready" button. Once both have ack'd, server transitions
// to IN_TURN with roles swapped. The Claude-generated condensation
// summary lands in M4 alongside the wrap-up summarizer.
function FloorSwapView({ sessionId, uid }: { sessionId: string; uid: string }) {
  const turnView = useCurrentTurn(sessionId);
  const [busy, setBusy] = useState(false);

  if (!turnView.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const turn = turnView.turn ?? {};
  const summary = turn.floor_swap_summary;
  const alreadyAcked = turn.swap_acks?.[uid] === true;
  const alreadyEndAcked = turn.end_acks?.[uid] === true;
  const isNextSpeaker = turn.speaker_uid === uid;

  const callable = async (
    name: 'ackFloorSwap' | 'requestSessionEnd',
    failureLabel: string,
  ) => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ session_id: string }, { ok: true }>(
        getFunctions(fb.app),
        name,
      );
      await fn({ session_id: sessionId });
    } catch (err) {
      Alert.alert(failureLabel, readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Floor swap</Text>
      <Text style={styles.heading}>
        {isNextSpeaker ? "It's your turn next" : 'Listening next'}
      </Text>
      <Text style={styles.paragraph}>
        Take a breath before continuing. Here's what just happened:
      </Text>
      {summary?.delivered_text ? (
        <>
          <Text style={styles.smallLabel}>They said</Text>
          <View style={[styles.translationBox, styles.translationBoxMuted]}>
            <Text style={styles.translationText}>{summary.delivered_text}</Text>
          </View>
        </>
      ) : null}
      {summary?.mirror_text ? (
        <>
          <Text style={styles.smallLabel}>You reflected</Text>
          <View style={styles.translationBox}>
            <Text style={styles.translationText}>{summary.mirror_text}</Text>
          </View>
        </>
      ) : null}
      <Pressable
        style={[
          styles.primaryButton,
          (busy || alreadyAcked) && styles.disabledButton,
        ]}
        disabled={busy || alreadyAcked}
        onPress={() => callable('ackFloorSwap', 'Could not continue')}
      >
        <Text style={styles.primaryLabel}>
          {alreadyAcked
            ? 'Waiting for your partner…'
            : busy
              ? 'Sending…'
              : 'Ready to continue'}
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.secondaryButton,
          (busy || alreadyEndAcked) && styles.disabledButton,
        ]}
        disabled={busy || alreadyEndAcked}
        onPress={() =>
          callable('requestSessionEnd', 'Could not request end of session')
        }
      >
        <Text style={styles.secondaryLabel}>
          {alreadyEndAcked
            ? 'Waiting for partner to also end…'
            : 'End the session'}
        </Text>
      </Pressable>
      <BreakButton sessionId={sessionId} />
    </ScrollView>
  );
}

// C9 — Wrap-up. Both partners see two AI-generated summary cards (one
// per partner). Each partner taps "This captures it" against their
// OWN summary; once both have confirmed, the wrap-up confirm trigger
// transitions to ENDED.
//
// Deferred to a follow-up: per-card "let me adjust" rewrite, the
// three next-action options (leave / schedule problem-solving / add
// to perpetual), and the optional appreciation prompt.
function WrapUpView({
  sessionId,
  uid,
  partnerAUid,
}: {
  sessionId: string;
  uid: string;
  partnerAUid: string;
}) {
  const navigation = useNavigation<Nav>();
  const summaryView = useSummary(sessionId);
  const [busy, setBusy] = useState(false);

  if (!summaryView.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const summary = summaryView.summary;
  const summariesReady =
    !!summary?.partner_a_summary && !!summary?.partner_b_summary;

  if (!summariesReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.paragraph, { marginTop: 16 }]}>
          Putting together what each of you said…
        </Text>
      </View>
    );
  }

  const isPartnerA = uid === partnerAUid;
  const ownSummary = isPartnerA
    ? summary.partner_a_summary
    : summary.partner_b_summary;
  const partnerSummary = isPartnerA
    ? summary.partner_b_summary
    : summary.partner_a_summary;
  const ownConfirmed = isPartnerA
    ? summary.partner_a_confirmed === true
    : summary.partner_b_confirmed === true;
  const partnerConfirmed = isPartnerA
    ? summary.partner_b_confirmed === true
    : summary.partner_a_confirmed === true;

  const confirm = async () => {
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      // Direct RTDB write — security rules already grant each partner
      // write access to their own confirmation flag. The wrap-up
      // confirm trigger picks it up and transitions to ENDED when
      // both partners have flipped their flag.
      const db = getDatabase(fb.app);
      const field = isPartnerA ? 'partner_a_confirmed' : 'partner_b_confirmed';
      await set(ref(db, `sessions/${sessionId}/summary/${field}`), true);
    } catch (err) {
      Alert.alert('Could not confirm', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stepLabel}>Wrap-up</Text>
      <Text style={styles.heading}>Here's what I heard you both say</Text>

      <Text style={styles.smallLabel}>Your story</Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{ownSummary}</Text>
      </View>
      <Pressable
        style={[
          styles.primaryButton,
          (busy || ownConfirmed) && styles.disabledButton,
        ]}
        disabled={busy || ownConfirmed}
        onPress={confirm}
      >
        <Text style={styles.primaryLabel}>
          {ownConfirmed
            ? partnerConfirmed
              ? 'Confirmed — wrapping up…'
              : 'Confirmed — waiting for your partner'
            : busy
              ? 'Confirming…'
              : 'This captures it'}
        </Text>
      </Pressable>

      <Text style={[styles.smallLabel, { marginTop: 24 }]}>Their story</Text>
      <View style={[styles.translationBox, styles.translationBoxMuted]}>
        <Text style={styles.translationText}>{partnerSummary}</Text>
      </View>
      {partnerConfirmed ? (
        <Text style={styles.helper}>
          Your partner has confirmed their summary.
        </Text>
      ) : (
        <Text style={styles.helper}>
          Your partner is reviewing their summary.
        </Text>
      )}

      <Pressable
        style={styles.secondaryButton}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.secondaryLabel}>Back to home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  topicContext: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#2563eb',
    borderRadius: 6,
    marginBottom: 16,
  },
  topicContextLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  topicContextText: { fontSize: 15, lineHeight: 20, color: '#0f172a' },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.85,
  },
  helper: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 12,
    textAlign: 'center',
  },
  partnerStatus: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  partnerStatusLabel: { fontSize: 14, color: '#166534' },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 16,
  },
  scoreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  scoreButtonSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  scoreLabel: { fontSize: 16 },
  scoreLabelSelected: { color: 'white', fontWeight: '600' },
  topicInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 100,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  topicBox: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginBottom: 24,
  },
  topicText: { fontSize: 17, lineHeight: 24 },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryLabel: { color: 'white', fontWeight: '600', fontSize: 16 },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 12,
  },
  secondaryLabel: { fontSize: 16 },
  subtleButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  subtleLabel: { fontSize: 14, color: '#64748b' },
  timerBox: {
    paddingVertical: 24,
    alignItems: 'center',
    marginVertical: 12,
  },
  timerLabel: {
    fontSize: 48,
    fontWeight: '300',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  disabledButton: { opacity: 0.4 },
  composeInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 140,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginVertical: 16,
    textAlignVertical: 'top',
  },
  feelingInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 80,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  warning: {
    padding: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    marginBottom: 12,
  },
  warningLabel: { color: '#854d0e', fontSize: 14 },
  smallLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  translationBox: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginBottom: 8,
  },
  translationBoxMuted: { backgroundColor: '#f8fafc', opacity: 0.85 },
  translationText: { fontSize: 16, lineHeight: 24 },
});
