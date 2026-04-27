import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import { login, register, AuthError, AuthUser } from '../auth';

type Props = {
  mode: 'login' | 'register';
  canRegister: boolean;
  onAuthed: (user: AuthUser) => void;
};

function errorMessage(err: AuthError, message?: string): string {
  if (message) return message;
  switch (err) {
    case 'invalid_credentials':
      return 'username or password is incorrect.';
    case 'username_taken':
      return 'that username is already taken.';
    case 'invalid_username':
      return 'username must be 3–32 chars: letters, numbers, _ . -';
    case 'invalid_password':
      return 'password must be at least 6 characters.';
    case 'registration_closed':
      return 'registration is closed.';
    case 'auth_unavailable':
      return 'sign-in is currently unavailable.';
    case 'network':
      return 'no connection. try again.';
    default:
      return 'something went wrong. try again.';
  }
}

export default function LoginScreen({ mode: initialMode, canRegister, onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const u = username.trim();
    if (!u || !password) {
      setErr('enter a username and password.');
      return;
    }
    setErr(null);
    setBusy(true);
    const fn = mode === 'login' ? login : register;
    const r = await fn(u, password);
    setBusy(false);
    if (r.ok) {
      onAuthed(r.data.user);
      return;
    }
    setErr(errorMessage(r.error, r.message));
  }

  const heading = mode === 'login' ? 'sign in' : 'create account';
  const cta = mode === 'login' ? 'sign in' : 'create';
  const switchLabel =
    mode === 'login'
      ? canRegister
        ? 'no account yet? create one'
        : ''
      : 'have an account? sign in';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.center}>
        <Text style={styles.brand}>Current</Text>
        <Text style={styles.hero}>Read what’s moving underneath.</Text>
        <Text style={styles.heading}>{heading}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="your username"
            placeholderTextColor={Colors.muted}
            selectionColor={Colors.amber}
            editable={!busy}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: Spacing.md }]}>password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'at least 6 characters' : 'your password'}
            placeholderTextColor={Colors.muted}
            selectionColor={Colors.amber}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {err ? <Text style={styles.error}>{err}</Text> : null}

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonBusy]}
            onPress={submit}
            activeOpacity={0.8}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={Colors.saltWhite} />
            ) : (
              <Text style={styles.buttonText}>{cta}</Text>
            )}
          </TouchableOpacity>

          {switchLabel ? (
            <TouchableOpacity
              style={styles.switch}
              onPress={() => {
                setErr(null);
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              activeOpacity={0.7}
              disabled={busy}
            >
              <Text style={styles.switchText}>{switchLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  center: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: {
    color: Colors.saltWhite,
    fontSize: FontSizes.xxl,
    fontFamily: Fonts.serifRegular,
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  hero: {
    color: Colors.sandLight,
    fontSize: FontSizes.md,
    fontFamily: Fonts.serifRegular,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    fontStyle: 'italic',
  },
  heading: {
    color: Colors.sand,
    fontSize: FontSizes.md,
    fontFamily: Fonts.sans as string,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    textTransform: 'lowercase',
  },
  form: {
    width: '100%',
  },
  label: {
    color: Colors.muted,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'lowercase',
    fontFamily: Fonts.sans as string,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.card,
    color: Colors.saltWhite,
    fontSize: FontSizes.md,
    fontFamily: Fonts.sans as string,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  error: {
    color: Colors.error,
    fontSize: FontSizes.sm,
    fontFamily: Fonts.sans as string,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.amber,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.saltWhite,
    fontSize: FontSizes.md,
    fontFamily: Fonts.sans as string,
    letterSpacing: 1,
    textTransform: 'lowercase',
    fontWeight: '600',
  },
  switch: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    color: Colors.sandLight,
    fontSize: FontSizes.sm,
    fontFamily: Fonts.sans as string,
    textTransform: 'lowercase',
  },
});
