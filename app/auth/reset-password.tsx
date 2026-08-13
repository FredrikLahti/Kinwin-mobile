// Landing screen for the emailed password-recovery link. Supabase's own
// React Native guidance (unlike the web SDK's automatic detectSessionInUrl,
// which this app deliberately disables — see lib/supabase/client.ts) has the
// app itself read the access_token/refresh_token pair out of the redirect
// URL and call setSession. This screen reads them from the route's own
// query params first (the common case once Expo Router has matched this
// path), and falls back to parsing the raw incoming URL directly in case
// GoTrue delivered them as a #fragment instead.
import * as Linking from 'expo-linking';
import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { parseAuthRedirectParams } from '@/lib/auth/parse-auth-redirect';
import { playImportantHaptic } from '@/lib/haptics';

type ScreenState =
  | { readonly kind: 'establishing' }
  | { readonly kind: 'invalid_link' }
  | { readonly kind: 'form' }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };

export default function ResetPasswordScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { applyRecoverySession, updatePassword } = useAuth();
  const params = useLocalSearchParams<{ access_token?: string | string[]; refresh_token?: string | string[] }>();

  const [state, setState] = useState<ScreenState>({ kind: 'establishing' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const establish = useCallback(async () => {
    setState({ kind: 'establishing' });
    const fromParams = {
      accessToken: Array.isArray(params.access_token) ? params.access_token[0] : params.access_token,
      refreshToken: Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token,
    };
    let accessToken = fromParams.accessToken;
    let refreshToken = fromParams.refreshToken;
    if (!accessToken || !refreshToken) {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const parsed = parseAuthRedirectParams(initialUrl);
        accessToken = accessToken ?? parsed.access_token;
        refreshToken = refreshToken ?? parsed.refresh_token;
      }
    }
    if (!accessToken || !refreshToken) {
      setState({ kind: 'invalid_link' });
      return;
    }
    const result = await applyRecoverySession(accessToken, refreshToken);
    setState(result.ok ? { kind: 'form' } : { kind: 'invalid_link' });
  }, [applyRecoverySession, params.access_token, params.refresh_token]);

  useFocusEffect(useCallback(() => { void establish(); }, [establish]));

  const canSubmit = password.length >= 8 && password === confirmPassword && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    void playImportantHaptic();
    setSubmitting(true);
    setFormError(null);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setState({ kind: 'done' });
  };

  const goToSignIn = () => {
    void playImportantHaptic();
    router.replace('/auth' as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text style={styles.wordmark}>KINWIN</Text>
            <Text accessibilityRole="header" style={styles.headline}>Set a new password.</Text>

            {state.kind === 'establishing' && (
              <Text accessibilityLiveRegion="polite" style={styles.body}>Confirming your reset link…</Text>
            )}

            {state.kind === 'invalid_link' && (
              <View style={styles.form}>
                <Text style={styles.error}>This link is no longer valid. Request a new one.</Text>
                <Pressable
                  accessibilityHint="Opens the password reset request screen"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => router.replace('/auth/forgot-password' as Href)}
                  style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
                >
                  <Text style={styles.textButtonLabel}>Request a new link</Text>
                </Pressable>
              </View>
            )}

            {state.kind === 'form' && (
              <View style={styles.form}>
                <View style={styles.field}>
                  <Text style={styles.label}>NEW PASSWORD</Text>
                  <TextInputV2
                    accessibilityLabel="New password"
                    autoCapitalize="none"
                    autoComplete="password-new"
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={theme.colors.warmGrey}
                    secureTextEntry
                    style={styles.input}
                    textContentType="newPassword"
                    value={password}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>CONFIRM PASSWORD</Text>
                  <TextInputV2
                    accessibilityLabel="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="password-new"
                    onChangeText={setConfirmPassword}
                    placeholder="Type it again"
                    placeholderTextColor={theme.colors.warmGrey}
                    secureTextEntry
                    style={styles.input}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                </View>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <Text style={styles.error}>Passwords do not match.</Text>
                )}
                {formError && <Text accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text>}
                <AnimatedPrimaryButton
                  accessibilityHint="Saves your new password"
                  disabled={!canSubmit}
                  label={submitting ? 'Saving…' : 'Save new password'}
                  onPress={() => void submit()}
                  reducedMotion={reducedMotion}
                />
              </View>
            )}

            {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}

            {state.kind === 'done' && (
              <View style={styles.form}>
                <Text accessibilityLiveRegion="polite" style={styles.notice}>Your password has been updated.</Text>
                <AnimatedPrimaryButton accessibilityHint="Continues to Kinwin" label="Continue" onPress={goToSignIn} reducedMotion={reducedMotion} />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 24, gap: 22,
  },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5, marginTop: 12 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 32, fontWeight: '400', letterSpacing: -0.5, lineHeight: 38,
  },
  body: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  input: {
    minHeight: 50, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, color: theme.colors.bone, fontSize: 15,
  },
  notice: { color: theme.colors.copperBright, fontSize: 14, lineHeight: 21 },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
});
