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
import { getDatabase, ref, set } from 'firebase/database';
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
        <PlaceholderView
          title="In session"
          body="The speaker-listener loop screens land in the next milestone."
        />
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
      <Text style={styles.heading}>What would you like to talk about?</Text>
      <Text style={styles.paragraph}>
        One sentence is enough. Your partner will see this and either accept it
        or ask you to reframe.
      </Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        placeholder="The thing on your mind…"
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
          {busy ? 'Sending…' : 'Send to partner'}
        </Text>
      </Pressable>
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

const styles = StyleSheet.create({
  container: { padding: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
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
});
