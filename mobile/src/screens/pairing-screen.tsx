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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { tryInitFirebase } from '../firebase';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { usePair } from '../hooks/use-pair';

type Mode = 'choose' | 'generate' | 'enter';

interface CreateResponse {
  code: string;
}

interface RedeemResponse {
  partner_uid: string;
}

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

export default function PairingScreen() {
  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [busy, setBusy] = useState(false);

  const auth = useAuthState();
  const uid = currentUid(auth);
  const pair = usePair(uid);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Auto-return to Home as soon as the binding lands in RTDB. Covers
  // the asymmetric case where Device A generated the code (and is
  // sitting on the "share this code" screen) — the redemption from
  // Device B doesn't otherwise notify Device A's UI.
  useEffect(() => {
    if (pair.ready && pair.partnerUid) {
      navigation.popToTop();
    }
  }, [pair, navigation]);

  const callCreate = async () => {
    setBusy(true);
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
      Alert.alert('Could not create code', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const callRedeem = async () => {
    if (!/^\d{6}$/.test(enteredCode)) {
      Alert.alert('Invalid code', 'Pair codes are 6 digits.');
      return;
    }
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase is not configured.');
      const fn = httpsCallable<{ code: string }, RedeemResponse>(
        getFunctions(fb.app),
        'redeemPairCode',
      );
      await fn({ code: enteredCode });
      Alert.alert('Paired', 'You and your partner are now paired.');
    } catch (err) {
      Alert.alert('Could not pair', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'choose') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Pair with your partner</Text>
        <Text style={styles.paragraph}>
          One of you generates a code and shares it with the other. The other
          enters it here. Codes expire after 10 minutes.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => setMode('generate')}
        >
          <Text style={styles.primaryLabel}>Generate a code</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setMode('enter')}
        >
          <Text style={styles.secondaryLabel}>Enter partner&apos;s code</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (mode === 'generate') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        {busy ? (
          <ActivityIndicator />
        ) : code ? (
          <View>
            <Text style={styles.paragraph}>
              Share this code with your partner:
            </Text>
            <Text style={styles.bigCode}>{code}</Text>
            <Text style={styles.helper}>Expires in 10 minutes.</Text>
          </View>
        ) : (
          <Pressable style={styles.primaryButton} onPress={callCreate}>
            <Text style={styles.primaryLabel}>Generate code</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Enter partner&apos;s code</Text>
      <TextInput
        value={enteredCode}
        onChangeText={(s) => setEnteredCode(s.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="123456"
        accessibilityLabel="Pair code"
        style={styles.input}
        editable={!busy}
      />
      <Pressable
        style={[
          styles.primaryButton,
          (busy || enteredCode.length !== 6) && styles.disabledButton,
        ]}
        disabled={busy || enteredCode.length !== 6}
        onPress={callRedeem}
      >
        <Text style={styles.primaryLabel}>{busy ? 'Pairing…' : 'Pair'}</Text>
      </Pressable>
    </ScrollView>
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
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 16, opacity: 0.8 },
  helper: { fontSize: 13, opacity: 0.6, textAlign: 'center', marginTop: 12 },
  bigCode: {
    fontSize: 48,
    fontWeight: '600',
    letterSpacing: 8,
    textAlign: 'center',
    marginVertical: 24,
  },
  input: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryLabel: { color: 'white', fontWeight: '600', fontSize: 16 },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryLabel: { fontSize: 16 },
  disabledButton: { opacity: 0.4 },
});
