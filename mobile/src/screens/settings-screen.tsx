import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import QuickExitButton from '../components/quick-exit-button';
import { tryInitFirebase } from '../firebase';
import { useAuthState } from '../hooks/use-auth-state';

export default function SettingsScreen() {
  const auth = useAuthState();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');

  const email =
    auth.ready && 'user' in auth && auth.user ? auth.user.email : null;

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: async () => {
          const fb = tryInitFirebase();
          if (!fb) return;
          try {
            await signOut(fb.auth);
          } catch (err) {
            Alert.alert('Could not sign out', friendlyError(err));
          }
        },
      },
    ]);
  };

  const onDelete = async () => {
    const fb = tryInitFirebase();
    if (!fb || !fb.auth.currentUser || !email) return;
    if (reauthPassword.length === 0) {
      Alert.alert(
        'Password needed',
        'Re-enter your password so we can confirm this is you.',
      );
      return;
    }
    setBusy(true);
    try {
      // Firebase requires a recent sign-in for account-destructive
      // operations. Ask the user to re-enter their password even if
      // they signed in a minute ago — simplest path.
      const cred = EmailAuthProvider.credential(email, reauthPassword);
      await reauthenticateWithCredential(fb.auth.currentUser, cred);
      // Server clears RTDB + deletes the Auth user. onAuthStateChanged
      // fires with null and the auth gate flips us to SignInScreen.
      const fn = httpsCallable<Record<string, never>, { ok: true }>(
        getFunctions(fb.app),
        'deleteUserData',
      );
      await fn({});
    } catch (err) {
      Alert.alert('Could not delete account', friendlyError(err));
    } finally {
      setBusy(false);
      setReauthPassword('');
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'Your account, screening, pairing, session history, and appreciation feed will be permanently removed. This cannot be undone.',
      [
        { text: 'Keep account', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => setShowDelete(true),
        },
      ],
    );
  };

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

      <View style={styles.section}>
        <Text style={styles.heading}>Account</Text>
        {email ? <Text style={styles.email}>Signed in as {email}</Text> : null}
        <Pressable
          style={[styles.secondaryButton, busy && styles.disabled]}
          disabled={busy}
          onPress={onSignOut}
        >
          <Text style={styles.secondaryLabel}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Feedback</Text>
        <Text style={styles.paragraph}>
          Anything confusing, broken, or missing? We&apos;re reading every note
          during the pilot.
        </Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Feedback')}
        >
          <Text style={styles.secondaryLabel}>Send feedback</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Support &amp; safety</Text>
        <Text style={styles.paragraph}>
          If you or someone you love needs to talk to a person, help lines are
          here for you.
        </Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Resources')}
        >
          <Text style={styles.secondaryLabel}>See support resources</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Delete account</Text>
        <Text style={styles.paragraph}>
          Removes your account, your pairing, all session history, your
          appreciation feed, and your baseline. Your partner&apos;s data stays
          with them. This cannot be undone.
        </Text>
        {!showDelete ? (
          <Pressable
            style={[styles.dangerButton, busy && styles.disabled]}
            disabled={busy}
            onPress={confirmDelete}
          >
            <Text style={styles.dangerLabel}>Delete my account</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.label}>Re-enter your password to confirm</Text>
            <TextInput
              value={reauthPassword}
              onChangeText={setReauthPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              style={styles.input}
              editable={!busy}
            />
            <Pressable
              style={[
                styles.dangerButton,
                (busy || reauthPassword.length === 0) && styles.disabled,
              ]}
              disabled={busy || reauthPassword.length === 0}
              onPress={onDelete}
            >
              <Text style={styles.dangerLabel}>
                {busy ? 'Deleting…' : 'Delete permanently'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.subtleButton, busy && styles.disabled]}
              disabled={busy}
              onPress={() => {
                setShowDelete(false);
                setReauthPassword('');
              }}
            >
              <Text style={styles.subtleLabel}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as AuthError).code;
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Password is incorrect.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a minute and try again.';
      case 'auth/network-request-failed':
        return 'Network issue. Check your connection and try again.';
      default:
        if ('message' in err)
          return String((err as { message: unknown }).message);
        return `Auth error (${code}).`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
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
  email: { fontSize: 14, color: '#0f172a', marginBottom: 12 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryLabel: { fontSize: 16, color: '#0f172a' },
  dangerButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#b91c1c',
  },
  dangerLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  subtleButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  subtleLabel: { color: '#64748b', fontSize: 14 },
  disabled: { opacity: 0.4 },
});
