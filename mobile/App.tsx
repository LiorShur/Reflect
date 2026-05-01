import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text } from 'react-native';

import HomeScreen from './src/screens/home-screen';
import PairingScreen from './src/screens/pairing-screen';
import ScreeningScreen from './src/screens/screening-screen';
import SettingsScreen from './src/screens/settings-screen';
import QuickExitButton from './src/components/quick-exit-button';
import { useAutoSignIn } from './src/hooks/use-auto-sign-in';

export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
  Screening: undefined;
  Settings: undefined;
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

export default function App() {
  useAutoSignIn();
  return (
    <SafeAreaProvider>
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
            name="Settings"
            component={SettingsScreen}
            options={{ headerTitle: 'Settings' }}
          />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerLink: { paddingHorizontal: 8, paddingVertical: 4 },
  headerLinkLabel: { fontSize: 15 },
});
