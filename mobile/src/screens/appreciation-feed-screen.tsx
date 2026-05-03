import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import {
  useAppreciationFeed,
  type AppreciationEntry,
} from '../hooks/use-appreciation-feed';

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

// R2 — Appreciation feed view. Scrollable list of received
// appreciations from the last 90 days, newest first. Reactions
// (heart / thanks / more) are deferred to a follow-up — for now
// the feed is read-only.
export default function AppreciationFeedScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const view = useAppreciationFeed(uid);

  if (!view.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (view.entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>No appreciations yet</Text>
        <Text style={styles.paragraph}>
          When your partner sends one, it will land here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={view.entries}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <EntryCard entry={item} />}
    />
  );
}

function EntryCard({ entry }: { entry: AppreciationEntry }) {
  const date = entry.created_at ? formatDate(new Date(entry.created_at)) : '';
  return (
    <View style={styles.card}>
      <Text style={styles.cardDate}>{date}</Text>
      <Text style={styles.cardContent}>{entry.content}</Text>
      {entry.tags && entry.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {entry.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagLabel}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatDate(d: Date): string {
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
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
    opacity: 0.7,
    textAlign: 'center',
  },
  list: { padding: 16 },
  card: {
    backgroundColor: '#f1f5f9',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: { fontSize: 16, lineHeight: 22, color: '#0f172a' },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: '#dbeafe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  tagLabel: { fontSize: 12, color: '#1d4ed8', fontWeight: '500' },
});
