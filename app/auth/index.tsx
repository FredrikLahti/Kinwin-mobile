import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

type Mode = 'sign_in' | 'sign_up';

export default function AuthScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { isConfigured, signIn, signUp, resendConfirmationEmail, status } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedUpNotice, setSignedUpNotice] = useState<'created' | 'check_email' | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (status === 'signed_in') {
      const target = returnTo && returnTo.startsWith('/') ? returnTo : '/account';
      // resumeSave=1 tells a returning screen (e.g. /share/activate) that it
      // was just navigated back to after a sign-in redirect, so it can retry
      // a save that was pending — router.replace mounts a fresh instance of
      // the target route, so that screen's own local state (e.g. "signed
      // out, waiting to save") cannot be relied on to have survived the trip.
      router.replace({ pathname: target, params: { resumeSave: '1' } } as Href);
    }
  }, [returnTo, router, status]);

  const canSubmit = email.trim().length > 3 && password.length >= 8 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    void playImportantHaptic();
    setSubmitting(true);
    setErrorMessage(null);
    setSignedUpNotice(null);
    if (mode === 'sign_in') {
      const result = await signIn(email, password);
      setSubmitting(false);
      if (!result.ok) setErrorMessage(result.message);
      return;
    }
    const result = await signUp(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    // With email confirmation enabled, signUp succeeds without a session
    // yet — needsConfirmation is the real, checked signal for that, not an
    // assumption.
    setSignedUpNotice(result.needsConfirmation ? 'check_email' : 'created');
    setPendingConfirmationEmail(result.needsConfirmation ? email.trim() : null);
    setResendState('idle');
    setMode('sign_in');
  };

  const resendConfirmation = async () => {
    if (!pendingConfirmationEmail || resendState === 'sending') return;
    void playSelectionHaptic();
    setResendState('sending');
    setErrorMessage(null);
    const result = await resendConfirmationEmail(pendingConfirmationEmail);
    setResendState(result.ok ? 'sent' : 'idle');
    if (!result.ok) setErrorMessage(result.message);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    void playSelectionHaptic();
    setMode(next);
    setErrorMessage(null);
    setSignedUpNotice(null);
  };

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
        <StatusBar style="light" />
        <View style={styles.centeredContent}>
          <Text style={styles.wordmark}>KINWIN</Text>
          <Text style={styles.headline}>Not connected yet</Text>
          <Text style={styles.body}>
            This build has no Supabase project configured. Set EXPO_PUBLIC_SUPABASE_URL and
            EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example) and restart the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint="Returns to the Kinwin welcome screen"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>

            <View style={styles.intro}>
              <Text style={styles.phaseLabel}>INTERNAL BETA</Text>
              <Text accessibilityRole="header" style={styles.headline}>
                {mode === 'sign_in' ? 'Sign in to continue.' : 'Create your account.'}
              </Text>
              <Text style={styles.supportingCopy}>
                {mode === 'sign_in'
                  ? 'Your saved draft and account stay with your Kinwin sign-in.'
                  : 'Email and password for now. Apple and Google sign-in come later.'}
              </Text>
            </View>

            <View style={styles.modeSwitch}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'sign_in' }}
                onPress={() => switchMode('sign_in')}
                style={[styles.modeOption, mode === 'sign_in' && styles.modeOptionSelected]}
              >
                <Text style={[styles.modeText, mode === 'sign_in' && styles.modeTextSelected]}>Sign in</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'sign_up' }}
                onPress={() => switchMode('sign_up')}
                style={[styles.modeOption, mode === 'sign_up' && styles.modeOptionSelected]}
              >
                <Text style={[styles.modeText, mode === 'sign_up' && styles.modeTextSelected]}>Sign up</Text>
              </Pressable>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>EMAIL</Text>
                <TextInputV2
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.warmGrey}
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>PASSWORD</Text>
                <TextInputV2
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={mode === 'sign_in' ? 'password' : 'password-new'}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={theme.colors.warmGrey}
                  secureTextEntry
                  style={styles.input}
                  textContentType={mode === 'sign_in' ? 'password' : 'newPassword'}
                  value={password}
                />
                {mode === 'sign_in' && (
                  <Pressable
                    accessibilityHint="Opens the password reset request screen"
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={() => { void playSelectionHaptic(); router.push('/auth/forgot-password' as Href); }}
                    style={({ pressed }) => [styles.forgotPasswordLink, pressed && styles.forgotPasswordLinkPressed]}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>
                )}
              </View>

              {signedUpNotice === 'check_email' && (
                <View style={styles.checkEmailBlock}>
                  <Text accessibilityLiveRegion="polite" style={styles.notice}>
                    Check your email to confirm your account before signing in.
                  </Text>
                  {resendState === 'sent' ? (
                    <Text style={styles.notice}>Confirmation email sent again.</Text>
                  ) : (
                    <Pressable
                      accessibilityHint="Sends the confirmation email again"
                      accessibilityRole="button"
                      disabled={resendState === 'sending'}
                      hitSlop={6}
                      onPress={() => void resendConfirmation()}
                      style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
                    >
                      <Text style={styles.textButtonLabel}>{resendState === 'sending' ? 'Sending…' : 'Resend confirmation email'}</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {signedUpNotice === 'created' && (
                <Text accessibilityLiveRegion="polite" style={styles.notice}>
                  Account created. Sign in below to continue.
                </Text>
              )}
              {errorMessage && (
                <Text accessibilityLiveRegion="assertive" style={styles.error}>
                  {errorMessage}
                </Text>
              )}
            </View>

            <AnimatedPrimaryButton
              accessibilityHint={mode === 'sign_in' ? 'Signs in with your email and password' : 'Creates a new Kinwin account'}
              disabled={!canSubmit}
              label={submitting ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
              onPress={() => void submit()}
              reducedMotion={reducedMotion}
            />
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
  centeredContent: {
    flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 26,
  },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 32, fontWeight: '400', letterSpacing: -0.5, lineHeight: 38,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  body: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  modeSwitch: {
    flexDirection: 'row', borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.controlled, overflow: 'hidden',
  },
  modeOption: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  modeOptionSelected: { backgroundColor: theme.colors.surfaceRaised },
  modeText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  modeTextSelected: { color: theme.colors.copperBright },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  input: {
    minHeight: 50, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, color: theme.colors.bone, fontSize: 15,
  },
  notice: { color: theme.colors.copperBright, fontSize: 13, lineHeight: 19 },
  checkEmailBlock: { gap: 8 },
  textButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  forgotPasswordLink: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', marginTop: 2 },
  forgotPasswordLinkPressed: { opacity: 0.7 },
  forgotPasswordText: { color: theme.colors.copperBright, fontSize: 12, fontWeight: '700' },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
});
