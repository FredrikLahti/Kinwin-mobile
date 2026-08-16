// Landing screen for the emailed password-recovery link. Kinwin's Supabase
// client is deliberately configured for the implicit auth flow, not PKCE
// (see lib/supabase/client.ts's flowType comment for why: this app's
// recovery links are routinely opened in a different context — a browser,
// a different device's mail client — than the one that requested them,
// which a PKCE code exchange cannot complete). Under implicit flow, GoTrue
// verifies the emailed token server-side and hands back a ready
// access_token/refresh_token pair directly, so — unlike the web SDK's
// automatic detectSessionInUrl, which this app deliberately disables (see
// lib/supabase/client.ts) — this screen reads that pair out of the
// redirect URL itself and calls setSession. It reads them from the route's
// own query params first (the common case once Expo Router has matched
// this path), and falls back to parsing the raw incoming URL directly in
// case they arrived as a #fragment instead. A PKCE `?code=` is
// deliberately never handled here — see lib/auth/parse-auth-redirect.ts.
import * as Linking from 'expo-linking';
import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledFieldV2 } from '@/components/v2/labeled-field';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
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

  // updatePassword's success (USER_UPDATED) already promotes the recovery
  // session to an ordinary signed-in one (see lib/auth/recovery-mode-status.ts)
  // — the user is genuinely authenticated at this point, so this goes
  // straight to Home rather than back through /auth just to be redirected
  // again. Matches app/index.tsx's own signed-in destination.
  const continueToApp = () => {
    void playImportantHaptic();
    router.replace('/home' as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text numberOfLines={1} style={styles.wordmark}>KINWIN</Text>
            <Text accessibilityRole="header" style={styles.headline}>Set a new password</Text>

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
                <LabeledFieldV2 label="New password">
                  <TextInputV2
                    accessibilityLabel="New password"
                    autoCapitalize="none"
                    autoComplete="password-new"
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={theme.colors.warmGrey}
                    secureTextEntry
                    selectionColor={theme.colors.oxblood}
                    style={styles.input}
                    textContentType="newPassword"
                    value={password}
                  />
                </LabeledFieldV2>
                <LabeledFieldV2 label="Confirm password">
                  <TextInputV2
                    accessibilityLabel="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="password-new"
                    onChangeText={setConfirmPassword}
                    placeholder="Type it again"
                    placeholderTextColor={theme.colors.warmGrey}
                    secureTextEntry
                    selectionColor={theme.colors.oxblood}
                    style={styles.input}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                </LabeledFieldV2>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <Text style={styles.error}>Passwords do not match.</Text>
                )}
                {formError && <Text accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text>}
                <PrimaryButtonV2
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
                <PrimaryButtonV2 accessibilityHint="Continues to Kinwin" label="Continue" onPress={continueToApp} reducedMotion={reducedMotion} />
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
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: theme.spacing.large, paddingBottom: theme.spacing.small, gap: 22,
  },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  form: { gap: 16 },
  input: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  notice: { color: theme.colors.ivory, fontSize: 14, lineHeight: 21 },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
});
