import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { tryInitFirebase } from '../firebase';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { usePair, type PairState } from '../hooks/use-pair';
import { useScreening, type ScreeningState } from '../hooks/use-screening';
import {
  useActiveSessionId,
  usePartnerSessionPresence,
} from '../hooks/use-session';
import {
  appreciationSuppressed,
  useLastConflictAt,
} from '../hooks/use-last-conflict-at';

export default function HomeScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const pair = usePair(uid);
  const screening = useScreening(uid);
  const activeSessionId = useActiveSessionId(uid);
  const partnerUid = pair.ready ? pair.partnerUid : null;
  const partnerInSession = usePartnerSessionPresence(
    activeSessionId,
    partnerUid,
  );
  const lastConflictAt = useLastConflictAt(uid);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [creating, setCreating] = useState(false);

  const signedIn = uid !== null;
  const screeningDone = screening.ready && screening.completed;
  const paired = pair.ready && pair.partnerUid !== null;
  const unpaired = pair.ready && pair.partnerUid === null;
  const tierLow =
    screening.ready && screening.completed && screening.tier === 'low';

  // R5 — appreciation suppression. Within 4h of a conflict-mode session
  // ending, hide the send-appreciation entry; replace with a gentle
  // explanation. The receiving feed remains accessible regardless.
  const appreciationOff = appreciationSuppressed(lastConflictAt);
  const showAppreciationLinks = signedIn && paired && screeningDone;

  // CTA priority (one at a time):
  //  1. screening — docs/07 critical principle 1
  //  2. pairing  — gated by tier !== 'high'
  //  3. resume   — auto-routes if there's an active session
  //  4. start    — only when paired, both screened low, no active
  const showScreeningButton = signedIn && !screeningDone;
  const showPairButton =
    signedIn && screeningDone && screening.tier !== 'high' && unpaired;
  const showResumeButton = signedIn && activeSessionId !== null;
  const showStartButton =
    signedIn && paired && tierLow && activeSessionId === null;

  // Auto-route into a session ONLY on the transition from "no
  // session" → "session exists". The ref prevents a Back-button trap:
  // if the user pops back from Session to Home, activeSessionId is
  // still set, but `prev` was also set, so the effect doesn't re-fire.
  // (native-stack keeps Home mounted underneath, so the ref persists.)
  // First mount with an existing active session DOES auto-route — that
  // covers the partner-side flow when one device starts and the other
  // is sitting on Home.
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    if (prev === null && activeSessionId !== null) {
      navigation.navigate('Session', { sessionId: activeSessionId });
    }
    prevSessionIdRef.current = activeSessionId;
  }, [activeSessionId, navigation]);

  // Partner-presence auto-route: when the partner enters the active
  // session (presence flips false → true), pull this device in too.
  // Same ref-guard pattern as above so a Back-press doesn't loop the
  // user back into the session against their will.
  const prevPartnerInSessionRef = useRef(false);
  useEffect(() => {
    const prev = prevPartnerInSessionRef.current;
    if (!prev && partnerInSession && activeSessionId) {
      navigation.navigate('Session', { sessionId: activeSessionId });
    }
    prevPartnerInSessionRef.current = partnerInSession;
  }, [partnerInSession, activeSessionId, navigation]);

  const startSession = async () => {
    setCreating(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const fn = httpsCallable<{ mode: 'conflict' }, { session_id: string }>(
        getFunctions(fb.app),
        'createSession',
      );
      const result = await fn({ mode: 'conflict' });
      navigation.navigate('Session', {
        sessionId: result.data.session_id,
      });
    } catch (err) {
      Alert.alert('Could not start session', readableError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reflect</Text>
      <Text style={styles.subtitle}>{authStatusLabel(auth)}</Text>
      <Text style={styles.subtitle}>{screeningStatusLabel(screening)}</Text>
      <Text style={styles.subtitle}>{pairStatusLabel(pair)}</Text>

      {showScreeningButton ? (
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('Screening')}
        >
          <Text style={styles.buttonLabel}>Begin check-in</Text>
        </Pressable>
      ) : null}

      {showPairButton ? (
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('Pairing')}
        >
          <Text style={styles.buttonLabel}>Pair with partner</Text>
        </Pressable>
      ) : null}

      {showResumeButton ? (
        <Pressable
          style={styles.button}
          onPress={() =>
            navigation.navigate('Session', { sessionId: activeSessionId! })
          }
        >
          <Text style={styles.buttonLabel}>
            {partnerInSession
              ? 'Join — your partner is in the session'
              : 'Resume session'}
          </Text>
        </Pressable>
      ) : null}

      {showStartButton ? (
        <Pressable
          style={[styles.button, creating && styles.buttonDisabled]}
          disabled={creating}
          onPress={startSession}
        >
          <Text style={styles.buttonLabel}>
            {creating ? 'Starting…' : 'Start a session'}
          </Text>
        </Pressable>
      ) : null}

      {showAppreciationLinks ? (
        <>
          {appreciationOff ? (
            <Text style={styles.suppressedNote}>
              Appreciation prompt is paused for a few hours after a session.
              Space first.
            </Text>
          ) : (
            <Pressable
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => navigation.navigate('Appreciation')}
            >
              <Text style={[styles.buttonLabel, styles.buttonLabelSecondary]}>
                Send an appreciation
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => navigation.navigate('AppreciationFeed')}
          >
            <Text style={[styles.buttonLabel, styles.buttonLabelSecondary]}>
              Appreciation feed
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

function authStatusLabel(auth: AuthState): string {
  if (!auth.ready) return 'checking sign-in…';
  if ('error' in auth) return 'firebase not configured';
  if (auth.user) return `signed in as ${auth.user.uid.slice(0, 8)}…`;
  return 'not signed in';
}

function screeningStatusLabel(s: ScreeningState): string {
  if (!s.ready) return '';
  if (!s.completed) return 'check-in not done';
  return 'check-in complete';
}

function pairStatusLabel(pair: PairState): string {
  if (!pair.ready) return '';
  if (pair.partnerUid) return `paired with ${pair.partnerUid.slice(0, 8)}…`;
  return 'not paired';
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 32, fontWeight: '600', marginBottom: 12 },
  subtitle: { fontSize: 14, opacity: 0.6, marginBottom: 4 },
  button: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: 'white', fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  buttonLabelSecondary: { color: '#0f172a' },
  suppressedNote: {
    marginTop: 16,
    paddingHorizontal: 24,
    fontSize: 13,
    opacity: 0.65,
    textAlign: 'center',
  },
});
