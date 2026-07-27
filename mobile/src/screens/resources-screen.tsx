import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RESOURCES, DEFAULT_RESOURCE } from '../lib/screening-resources';

// S5 — regional safety resources. Reachable from:
//   - Settings → Help & safety
//   - Compose warning when a disclosure pattern hits (S7 light)
//   - App-store deep links (once wired)
//
// Content lives in mobile/src/lib/screening-resources.ts and mirrors
// docs/07-safety-screening § Resources by region. DV specialist
// review is a prerequisite before this list drives public-launch
// behavior; entries marked TODO(dv-review) still need validation.
export default function ResourcesScreen() {
  const entries = [...Object.values(RESOURCES), DEFAULT_RESOURCE];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Support resources</Text>
      <Text style={styles.paragraph}>
        Reflect is a communication tool, not a substitute for professional care
        or crisis response. If you feel unsafe or need to talk to someone,
        please reach out to a service below.
      </Text>
      {entries.map((r) => (
        <View key={r.region} style={styles.card}>
          <Text style={styles.region}>{r.region}</Text>
          <Text style={styles.primary}>{r.primary}</Text>
          {r.secondary ? (
            <Pressable
              onPress={() => {
                void Linking.openURL(ensureHttps(r.secondary!));
              }}
              accessibilityRole="link"
            >
              <Text style={styles.link}>{r.secondary}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Text style={styles.footnote}>
        Reflect does not detect abuse reliably. If you are in immediate danger,
        contact local emergency services.
      </Text>
    </ScrollView>
  );
}

function ensureHttps(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.85,
    marginBottom: 20,
  },
  card: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },
  region: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    fontWeight: '600',
  },
  primary: { fontSize: 16, color: '#0f172a', marginBottom: 4 },
  link: { fontSize: 15, color: '#2563eb', textDecorationLine: 'underline' },
  footnote: {
    marginTop: 20,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
});
