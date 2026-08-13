import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Deliberately a single, neutral "sent" state regardless of whether the
  // email actually has an account — Supabase's own resetPasswordForEmail
  // never distinguishes the two either, so nothing here could leak it even
  // by accident.
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 3 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    void playImportantHaptic();
    setSubmitting(true);
    setErrorMessage(null);
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setSent(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint="Returns to sign in"
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
              <Text accessibilityRole="header" style={styles.headline}>Reset your password.</Text>
              <Text style={styles.supportingCopy}>Enter your account email. If an account exists for it, we&apos;ll send instructions.</Text>
            </View>

            {sent ? (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                If an account exists for that email, instructions have been sent. Check your inbox.
              </Text>
            ) : (
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
                {errorMessage && (
                  <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage}</Text>
                )}
                <AnimatedPrimaryButton
                  accessibilityHint="Sends password reset instructions to this email"
                  disabled={!canSubmit}
                  label={submitting ? 'Sending…' : 'Send reset instructions'}
                  onPress={() => void submit()}
                  reducedMotion={reducedMotion}
                />
              </View>
            )}

            {sent && (
              <Pressable
                accessibilityHint="Returns to sign in"
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => { void playSelectionHaptic(); router.back(); }}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Back to sign in</Text>
              </Pressable>
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
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  intro: { gap: 8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 32, fontWeight: '400', letterSpacing: -0.5, lineHeight: 38,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
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
