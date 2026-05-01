import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { usePair, type PairState } from '../hooks/use-pair';

export default function HomeScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const pair = usePair(uid);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const showPairButton = uid !== null && pair.ready && pair.partnerUid === null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reflect</Text>
      <Text style={styles.subtitle}>{authStatusLabel(auth)}</Text>
      <Text style={styles.subtitle}>{pairStatusLabel(pair)}</Text>
      {showPairButton ? (
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
