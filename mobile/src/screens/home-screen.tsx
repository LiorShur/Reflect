import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { usePair, type PairState } from '../hooks/use-pair';
import { useScreening, type ScreeningState } from '../hooks/use-screening';

export default function HomeScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const pair = usePair(uid);
  const screening = useScreening(uid);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const signedIn = uid !== null;
  const screeningDone = screening.ready && screening.completed;
  const unpaired = pair.ready && pair.partnerUid === null;

  // docs/07 critical principle 1: per-user screening must complete on
  // each device BEFORE pairing. Show one CTA at a time.
  const showScreeningButton = signedIn && !screeningDone;
  const showPairButton = signedIn && screeningDone && unpaired;
  // High-tier users: joint conflict mode is never offered (docs/07
  // § Tier responses). For now we only render the pair CTA when
  // tier !== 'high'. Moderate tier sees the pair CTA but the
  // downstream conflict-mode screens are gated separately in M3.
  const tierBlocksPairing =
    screening.ready && screening.completed && screening.tier === 'high';

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

      {showPairButton && !tierBlocksPairing ? (
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('Pairing')}
        >
          <Text style={styles.buttonLabel}>Pair with partner</Text>
        </Pressable>
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
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonLabel: { color: 'white', fontWeight: '600' },
});
