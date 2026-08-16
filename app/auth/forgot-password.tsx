import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledFieldV2 } from '@/components/v2/labeled-field';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoidingView}>
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
              <Text numberOfLines={1} style={styles.wordmark}>KINWIN</Text>
            </View>

            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.headline}>Reset your password</Text>
              <Text style={styles.supportingCopy}>Enter your account email. If an account exists for it, we’ll send instructions.</Text>
            </View>

            {sent ? (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                If an account exists for that email, instructions have been sent. Check your inbox.
              </Text>
            ) : (
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
                {errorMessage && (
                  <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage}</Text>
                )}
                <PrimaryButtonV2
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
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 6, paddingBottom: theme.spacing.small, gap: 22,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  intro: { gap: 8 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  supportingCopy: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  form: { gap: 16 },
  input: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  notice: { color: theme.colors.ivory, fontSize: 14, lineHeight: 21 },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
});
