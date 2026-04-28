import { StyleSheet, Text, View } from 'react-native';

import { useAuthState } from '../hooks/use-auth-state';

export default function HomeScreen() {
  const auth = useAuthState();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reflect</Text>
      <Text style={styles.subtitle}>{authStatusLabel(auth)}</Text>
    </View>
  );
}

function authStatusLabel(auth: ReturnType<typeof useAuthState>): string {
  if (!auth.ready) return 'checking sign-in…';
  if (auth.user) return `signed in as ${auth.user.uid}`;
  return 'not signed in';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
});
