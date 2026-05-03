import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getDatabase, push, ref, set } from 'firebase/database';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { tryInitFirebase } from '../firebase';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { usePair } from '../hooks/use-pair';

// Pure helper duplicated from functions/src/friendship/specificity.ts
// — see that file for the canonical implementation. Kept simple here
// so the mobile build doesn't depend on the functions workspace.
const STOPWORDS = new Set([
  'thanks',
  'thank',
  'love',
  'you',
  'the',
  'a',
  'an',
  'is',
  'was',
  'were',
  'been',
  'being',
  'are',
  'am',
  'so',
  'much',
  'really',
  'very',
  'good',
  'great',
  'nice',
  'sweet',
  'kind',
  'i',
  'me',
  'my',
  'mine',
  'your',
  'yours',
  'for',
  'to',
  'today',
  'tonight',
  'always',
  'just',
  'and',
  'or',
  'but',
  'wow',
  'yeah',
  'yes',
  'cool',
  'awesome',
]);

function isGenericAppreciation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length >= 25) return false;
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const nonStop = tokens.filter((t) => !STOPWORDS.has(t));
  return nonStop.length < 2;
}

const TAGS = ['helped me', 'made me laugh', 'was patient', 'was kind'];

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

// R1 — Daily appreciation. Single screen, one prompt. Optional tag
// chips. Inline specificity nudge for generic input. Sends directly
// to /appreciation_feed/{partner_uid}/{auto-id} per existing security
// rules (sender-attributed write).
export default function AppreciationScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const pair = usePair(uid);
  const partnerUid = pair.ready ? pair.partnerUid : null;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [text, setText] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const generic = useMemo(() => isGenericAppreciation(text), [text]);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !!partnerUid && !busy;

  const toggleTag = (tag: string) => {
    setActiveTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  };

  const submit = async () => {
    if (!canSend || !uid || !partnerUid) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase not configured.');
      const db = getDatabase(fb.app);
      const feedRef = ref(db, `appreciation_feed/${partnerUid}`);
      const entryRef = push(feedRef);
      await set(entryRef, {
        from_uid: uid,
        content: trimmed,
        tags: activeTags.length > 0 ? activeTags : null,
        created_at: Date.now(),
      });
      Alert.alert('Sent', 'Your partner will see it on their feed.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Could not send', readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!partnerUid) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Pair first</Text>
        <Text style={styles.paragraph}>
          You need a paired partner before you can send appreciations.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.stepLabel}>Today's appreciation</Text>
        <Text style={styles.heading}>
          What did your partner do today that you appreciated?
        </Text>
        <Text style={styles.paragraph}>
          One specific thing lands better than something general. No pressure to
          send if nothing's coming to mind.
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="They did this thing today…"
          multiline
          style={styles.input}
          editable={!busy}
          maxLength={500}
        />
        {generic ? (
          <Text style={styles.nudge}>
            What specifically today? A small concrete moment lands stronger.
          </Text>
        ) : null}

        <Text style={styles.smallLabel}>Optional tags</Text>
        <View style={styles.tagRow}>
          {TAGS.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.tag, active && styles.tagActive]}
                onPress={() => toggleTag(tag)}
                disabled={busy}
              >
                <Text
                  style={[styles.tagLabel, active && styles.tagLabelActive]}
                >
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.primaryButton, !canSend && styles.disabledButton]}
          disabled={!canSend}
          onPress={submit}
        >
          <Text style={styles.primaryLabel}>
            {busy ? 'Sending…' : 'Send to partner'}
          </Text>
        </Pressable>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.85,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  nudge: {
    fontSize: 13,
    color: '#854d0e',
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  smallLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
  },
  tagActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  tagLabel: { fontSize: 14, color: '#475569' },
  tagLabelActive: { color: '#1d4ed8', fontWeight: '600' },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryLabel: { color: 'white', fontWeight: '600', fontSize: 16 },
  disabledButton: { opacity: 0.4 },
});
