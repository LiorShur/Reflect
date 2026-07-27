import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AppreciationScreen from './src/screens/appreciation-screen';
import AppreciationFeedScreen from './src/screens/appreciation-feed-screen';
import FeedbackScreen from './src/screens/feedback-screen';
import HomeScreen from './src/screens/home-screen';
import PairingScreen from './src/screens/pairing-screen';
import ResourcesScreen from './src/screens/resources-screen';
import ScreeningScreen from './src/screens/screening-screen';
import SessionScreen from './src/screens/session-screen';
import SettingsScreen from './src/screens/settings-screen';
import SignInScreen from './src/screens/sign-in-screen';
import QuickExitButton from './src/components/quick-exit-button';
import { useAuthState } from './src/hooks/use-auth-state';
import { initSentry, wrap as sentryWrap } from './src/sentry';

// Init Sentry as early as possible so bootstrap errors are captured.
// No-op when EXPO_PUBLIC_SENTRY_DSN isn't set.
initSentry();

export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
  Screening: undefined;
  Session: { sessionId: string };
  Settings: undefined;
  Appreciation: undefined;
  AppreciationFeed: undefined;
  Feedback: undefined;
  Resources: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HeaderSettingsLink() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      onPress={() => navigation.navigate('Settings')}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      hitSlop={8}
      style={styles.headerLink}
    >
      <Text style={styles.headerLinkLabel}>Settings</Text>
    </Pressable>
  );
}

// Top-level auth gate. Unsigned → SignInScreen (full screen, no
// navigator). Signed → normal stack. onAuthStateChanged inside
// useAuthState flips this automatically after sign-in / sign-out.
// This replaces the pre-A1 anonymous auto-sign-in bridge.
function App() {
  const auth = useAuthState();

  return (
    <SafeAreaProvider>
      {!auth.ready ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : 'error' in auth ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            App isn&apos;t configured. Missing Firebase credentials.
          </Text>
        </View>
      ) : auth.user === null ? (
        <SignInScreen />
      ) : (
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerTitle: 'Reflect' }}>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ headerRight: () => <HeaderSettingsLink /> }}
            />
            <Stack.Screen
              name="Pairing"
              component={PairingScreen}
              options={{ headerTitle: 'Pair' }}
            />
            <Stack.Screen
              name="Screening"
              component={ScreeningScreen}
              options={{
                headerTitle: 'Quick check-in',
                // docs/07 § Quick-exit pattern requires a direct
                // "Leave now" button on every screening screen, not
                // just a path through Settings.
                headerRight: () => <QuickExitButton variant="header" />,
              }}
            />
            <Stack.Screen
              name="Session"
              component={SessionScreen}
              options={{
                headerTitle: 'Session',
                // Sessions are equally sensitive — surface "Leave now"
                // on the header without requiring a Settings detour.
                headerRight: () => <QuickExitButton variant="header" />,
              }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ headerTitle: 'Settings' }}
            />
            <Stack.Screen
              name="Appreciation"
              component={AppreciationScreen}
              options={{ headerTitle: 'Appreciation' }}
            />
            <Stack.Screen
              name="AppreciationFeed"
              component={AppreciationFeedScreen}
              options={{ headerTitle: 'Appreciation feed' }}
            />
            <Stack.Screen
              name="Feedback"
              component={FeedbackScreen}
              options={{ headerTitle: 'Send feedback' }}
            />
            <Stack.Screen
              name="Resources"
              component={ResourcesScreen}
              options={{ headerTitle: 'Support' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      )}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

// Wrap the whole app in Sentry's error boundary so runtime crashes in
// the React tree get captured. Safe when Sentry is not configured —
// wrap becomes an identity function via our sentry.ts shim behavior.
export default sentryWrap(App);

const styles = StyleSheet.create({
  headerLink: { paddingHorizontal: 8, paddingVertical: 4 },
  headerLinkLabel: { fontSize: 15 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: { fontSize: 15, color: '#b91c1c', textAlign: 'center' },
});
