import { useState } from 'react';
import {
  ActivityIndicator,
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
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';

import { tryInitFirebase } from '../firebase';

type Mode = 'sign_in' | 'sign_up';

// A1 — real auth (email + password only for the pilot). Google + Apple
// providers land alongside public-launch prep; adding Google forces
// Sign-in-with-Apple per App Store rules, and email covers the
// 5-couple pilot cohort cleanly.
//
// This screen renders full-screen from App.tsx's auth gate when
// useAuthState reports no user. On successful auth, the gate flips
// automatically via onAuthStateChanged and the normal navigator
// mounts — no explicit navigation from here.
export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleanEmail = email.trim();
    if (cleanEmail.length === 0 || password.length === 0) return;
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      if (mode === 'sign_in') {
        await signInWithEmailAndPassword(fb.auth, cleanEmail, password);
      } else {
        await createUserWithEmailAndPassword(fb.auth, cleanEmail, password);
      }
      // onAuthStateChanged in App.tsx will flip the gate.
    } catch (err) {
      Alert.alert(
        mode === 'sign_in' ? 'Could not sign in' : 'Could not create account',
        friendlyAuthError(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const cleanEmail = email.trim();
    if (cleanEmail.length === 0) {
      Alert.alert(
        'Email needed',
        'Enter your email above first, then tap this again.',
      );
      return;
    }
    setBusy(true);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('App not configured.');
      await sendPasswordResetEmail(fb.auth, cleanEmail);
      Alert.alert(
        'Check your email',
        `We sent a reset link to ${cleanEmail}. Follow it to set a new password, then come back and sign in.`,
      );
    } catch (err) {
      Alert.alert('Could not send reset email', friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Reflect</Text>
        <Text style={styles.tagline}>
          A quieter way to have the conversations that matter.
        </Text>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, mode === 'sign_in' && styles.tabActive]}
            onPress={() => setMode('sign_in')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'sign_in' }}
          >
            <Text
              style={[
                styles.tabLabel,
                mode === 'sign_in' && styles.tabLabelActive,
              ]}
            >
              Sign in
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'sign_up' && styles.tabActive]}
            onPress={() => setMode('sign_up')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'sign_up' }}
          >
            <Text
              style={[
                styles.tabLabel,
                mode === 'sign_up' && styles.tabLabelActive,
              ]}
            >
              Create account
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={styles.input}
          editable={!busy}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={
            mode === 'sign_up' ? 'At least 6 characters' : 'Your password'
          }
          secureTextEntry
          autoCapitalize="none"
          autoComplete={
            mode === 'sign_up' ? 'new-password' : 'current-password'
          }
          textContentType={mode === 'sign_up' ? 'newPassword' : 'password'}
          style={styles.input}
          editable={!busy}
        />

        <Pressable
          style={[styles.primaryButton, !canSubmit && styles.disabled]}
          disabled={!canSubmit}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryLabel}>
              {mode === 'sign_in' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        {mode === 'sign_in' ? (
          <Pressable
            style={styles.subtle}
            onPress={resetPassword}
            disabled={busy}
          >
            <Text style={styles.subtleLabel}>Forgot password?</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>
          By continuing you agree to our terms and privacy policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as AuthError).code;
    switch (code) {
      case 'auth/invalid-email':
        return "That email doesn't look right.";
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return "Email and password don't match an account. Check the spelling or create an account.";
      case 'auth/email-already-in-use':
        return 'An account with that email already exists. Try signing in.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network issue. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a minute and try again.';
      default:
        return `Auth error (${code}). Try again in a moment.`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: {
    padding: 32,
    paddingTop: 80,
    minHeight: '100%',
  },
  brand: {
    fontSize: 36,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 40,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: { backgroundColor: '#ffffff' },
  tabLabel: { fontSize: 14, color: '#64748b' },
  tabLabelActive: { color: '#0f172a', fontWeight: '600' },
  label: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  subtle: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  subtleLabel: { color: '#64748b', fontSize: 14 },
  footnote: {
    marginTop: 40,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
});
