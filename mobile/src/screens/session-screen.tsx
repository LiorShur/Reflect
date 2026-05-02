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
    case 'PAUSED':
      return <PausedView meta={meta} />;
    case 'WRAP_UP':
      return (
        <PlaceholderView
          title="Wrap-up"
          body="Wrap-up summaries land in a later milestone."
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

// PAUSED
function PausedView({ meta }: { meta: SessionMeta }) {
  const remainingMs = (meta.paused_until ?? 0) - Date.now();
  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  return (
    <View style={styles.center}>
      <Text style={styles.heading}>Take a breather</Text>
      <Text style={styles.paragraph}>
        Based on the check-in, the session is paused for about {minutes} minute
        {minutes === 1 ? '' : 's'}. You can come back when you’re both ready.
      </Text>
      {meta.pause_reason ? (
        <Text style={styles.helper}>Reason: {meta.pause_reason}</Text>
      ) : null}
    </View>
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
  //   delivered → past compose, listener will mirror (M3d placeholder)
  //   translation && !approved → translator review (speaker)
  //   committed && !translation → translating spinner (speaker)
  //   else → compose (speaker) / waiting (listener)
  const delivered = turn.delivered?.text;
  const translationPending =
    turn.speaker_draft?.committed === true && !turn.translation;
  const reviewing = !!turn.translation && turn.translation.approved !== true;

  if (delivered) {
    return isSpeaker ? (
      <SpeakerPostDeliveryView text={delivered} />
    ) : (
      <ListenerDeliveredPlaceholder text={delivered} />
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

// Speaker post-delivery: their message is on the wire; listener will
// mirror in M3d. Placeholder until that lands.
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
      <Text style={styles.helper}>
        The mirroring + confirmation flow lands in the next milestone.
      </Text>
    </ScrollView>
  );
}

// Listener placeholder: shows the delivered text. M3d turns this
// into the proper mirroring screen.
function ListenerDeliveredPlaceholder({ text }: { text: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Your partner says</Text>
      <View style={styles.translationBox}>
        <Text style={styles.translationText}>{text}</Text>
      </View>
      <Text style={styles.helper}>
        The mirroring screen lands in the next milestone — for now, read what
        they said.
      </Text>
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
