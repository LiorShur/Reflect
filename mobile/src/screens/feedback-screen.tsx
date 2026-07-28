import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';

import type { RootStackParamList } from '../../App';
import { tryInitFirebase } from '../firebase';

// Pilot-ops: in-app feedback. Writes to /feedback/{uid} via a callable
// (server-only readable). Testers describe issues in their own words;
// we get context (app version, uid to correlate with telemetry).
export default function FeedbackScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      const fn = httpsCallable<
        { body: string; app_version?: string },
        { ok: true }
      >(getFunctions(fb.app), 'submitFeedback');
      const appVersion =
        (Constants.expoConfig?.version as string | undefined) ?? undefined;
      await fn({ body: trimmed, app_version: appVersion });
      Alert.alert(
        'Thanks',
        'We received your feedback. During the pilot the team reads every note.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Could not send', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const canSend = body.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Send feedback</Text>
        <Text style={styles.paragraph}>
          Bug, confusion, or just a thought. What would make this better for
          you?
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Tell us…"
          multiline
          style={styles.input}
          editable={!busy}
          maxLength={4000}
          autoFocus
        />
        <Pressable
          style={[styles.primaryButton, !canSend && styles.disabled]}
          disabled={!canSend}
          onPress={submit}
        >
          <Text style={styles.primaryLabel}>
            {busy ? 'Sending…' : 'Send feedback'}
          </Text>
        </Pressable>
        <Text style={styles.footnote}>
          Please don&apos;t include anything sensitive you wouldn&apos;t want
          associated with your account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24 },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.85,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 180,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 16,
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  footnote: {
    marginTop: 20,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
});
