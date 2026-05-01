import { ScrollView, StyleSheet, Text, View } from 'react-native';

import QuickExitButton from '../components/quick-exit-button';

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.heading}>Leave now</Text>
        <Text style={styles.paragraph}>
          Closes the app immediately. Always reachable from settings on every
          screen.
        </Text>
        <QuickExitButton />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  section: { marginBottom: 32 },
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 16,
  },
});
