import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { quickExit } from '../lib/quick-exit';

export interface QuickExitButtonProps {
  variant?: 'header' | 'inline';
}

export default function QuickExitButton({
  variant = 'inline',
}: QuickExitButtonProps) {
  const onPress = () => {
    const result = quickExit();
    if (result === 'platform_unsupported') {
      // iOS: no programmatic exit allowed. Tell the user how to leave
      // manually. The alert dismisses on its own when the user
      // backgrounds the app.
      Alert.alert(
        'Leave now',
        'Swipe up from the bottom of the screen to leave the app.',
      );
    }
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Leave now"
      hitSlop={8}
      style={variant === 'header' ? styles.header : styles.inline}
    >
      <Text style={styles.label}>Leave now</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 8, paddingVertical: 4 },
  inline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
    borderRadius: 6,
    backgroundColor: '#fce8e6',
  },
  label: { color: '#b00020', fontWeight: '600' },
});
