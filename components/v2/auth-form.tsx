import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabeledFieldV2 } from '@/components/v2/labeled-field';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export type AuthFormMode = 'sign_in' | 'sign_up';

type AuthFormV2Props = {
  initialMode?: AuthFormMode;
  /** Overrides for the mode-dependent headline/supporting copy — every caller (the standalone /auth screen, the Review commitment gate) frames the same underlying sign-in/sign-up mechanics differently, so this is the one thing intentionally left to the caller rather than hardcoded here. */
  signInHeadline?: string;
  signInSupportingCopy?: string;
  signUpHeadline?: string;
  signUpSupportingCopy?: string;
  /** Called right before navigating to /auth/forgot-password — a caller presenting this form inside a Modal must close it first, so navigation never happens underneath a still-open overlay. */
  onForgotPassword: () => void;
};

/**
 * The one real sign-in/sign-up form and its business logic (mode switch,
 * submit, email-confirmation notice + resend) — shared between the
 * standalone /auth screen and the contextual commitment-gate modal opened
 * from Review, so the two can never drift into duplicated auth behavior.
 * Deliberately owns no navigation of its own beyond the forgot-password
 * link (via the caller-supplied callback): what happens once `status`
 * actually becomes 'signed_in' is entirely the caller's decision, read
 * reactively from useAuth() — this form never redirects, and never saves,
 * activates, or prepares anything on its own.
 */
export function AuthFormV2({
  initialMode = 'sign_in',
  signInHeadline = 'Sign in to continue',
  signInSupportingCopy = 'Your challenges and account stay with your Kinwin sign-in.',
  signUpHeadline = 'Create your account',
  signUpSupportingCopy = 'Email and password for now. Apple and Google sign-in come later.',
  onForgotPassword,
}: AuthFormV2Props) {
  const reducedMotion = useReducedMotion();
  const { isConfigured, signIn, signUp, resendConfirmationEmail } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedUpNotice, setSignedUpNotice] = useState<'created' | 'check_email' | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

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

  const switchMode = (next: AuthFormMode) => {
    if (next === mode) return;
    void playSelectionHaptic();
    setMode(next);
    setErrorMessage(null);
    setSignedUpNotice(null);
  };

  if (!isConfigured) {
    return (
      <View style={styles.centeredContent}>
        <Text style={styles.headline}>Not connected yet</Text>
        <Text style={styles.body}>
          This build has no Supabase project configured. Set EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example) and restart the app.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.headline}>
          {mode === 'sign_in' ? signInHeadline : signUpHeadline}
        </Text>
        <Text style={styles.supportingCopy}>
          {mode === 'sign_in' ? signInSupportingCopy : signUpSupportingCopy}
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
        <LabeledFieldV2 label="Email">
          <TextInputV2
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.oxblood}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />
        </LabeledFieldV2>
        <View style={styles.field}>
          <LabeledFieldV2 label="Password">
            <TextInputV2
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete={mode === 'sign_in' ? 'password' : 'password-new'}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={theme.colors.warmGrey}
              secureTextEntry
              selectionColor={theme.colors.oxblood}
              style={styles.input}
              textContentType={mode === 'sign_in' ? 'password' : 'newPassword'}
              value={password}
            />
          </LabeledFieldV2>
          {mode === 'sign_in' && (
            <Pressable
              accessibilityHint="Opens the password reset request screen"
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => { void playSelectionHaptic(); onForgotPassword(); }}
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

      <PrimaryButtonV2
        accessibilityHint={mode === 'sign_in' ? 'Signs in with your email and password' : 'Creates a new Kinwin account'}
        disabled={!canSubmit}
        label={submitting ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
        onPress={() => void submit()}
        reducedMotion={reducedMotion}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22 },
  centeredContent: { gap: 14 },
  intro: { gap: 8 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  supportingCopy: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  modeSwitch: {
    flexDirection: 'row', borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.controlled, overflow: 'hidden',
  },
  modeOption: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  modeOptionSelected: { backgroundColor: theme.colors.oxbloodDeep },
  modeText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  modeTextSelected: { color: theme.colors.ivory },
  form: { gap: 16 },
  field: { gap: 8 },
  input: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  notice: { color: theme.colors.ivory, fontSize: 13, lineHeight: 19 },
  checkEmailBlock: { gap: 8 },
  textButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  forgotPasswordLink: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', marginTop: 2 },
  forgotPasswordLinkPressed: { opacity: 0.7 },
  forgotPasswordText: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '700' },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
});
