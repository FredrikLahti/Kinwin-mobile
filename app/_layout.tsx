import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { RootErrorBoundary } from '@/components/root-error-boundary';
import { kinwinTheme as theme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ChallengePreviewProvider } from '@/contexts/challenge-preview-context';
import { OnboardingProvider, useOnboarding } from '@/contexts/onboarding-context';
import { UXV2PreviewProvider } from '@/contexts/ux-v2-preview-context';
import { StripeProvider } from '@/lib/stripe/native-stripe';
import { readStripeConfig } from '@/lib/stripe/config';
import { resolveStripeUrlScheme } from '@/lib/stripe/stripe-url-scheme';

export default function RootLayout() {
  const stripeConfig = readStripeConfig();
  // Expo Go does not own the app's "kinwin" scheme (see
  // lib/stripe/stripe-url-scheme.ts) — a fixed scheme only round-trips a
  // card redirect/3D-Secure step in a standalone/custom-dev-client build.
  const stripeUrlScheme = resolveStripeUrlScheme({ appOwnership: Constants.appOwnership, createURL: Linking.createURL });
  return (
    // A missing publishable key never blocks the rest of the app: the real
    // StripeProvider only calls native init when publishableKey is truthy
    // (see @stripe/stripe-react-native's own source), and the web build of
    // this component ignores it entirely — payment-setup.tsx is what
    // actually reports "not configured" honestly.
    <RootErrorBoundary>
      <StripeProvider publishableKey={stripeConfig?.publishableKey ?? ''} urlScheme={stripeUrlScheme}>
        <AuthProvider>
          <OnboardingProvider>
            <ChallengePreviewProvider>
              <UXV2PreviewProvider>
                <AuthGate />
              </UXV2PreviewProvider>
            </ChallengePreviewProvider>
            <StatusBar style="auto" />
          </OnboardingProvider>
        </AuthProvider>
      </StripeProvider>
    </RootErrorBoundary>
  );
}

// Session restoration must resolve before any protected-route decision is
// made, so a deep link into a protected screen never flashes its content
// (or bounces away) while `getSession()` is still in flight.
function AuthGate() {
  const { profile, status, user } = useAuth();
  const onboarding = useOnboarding();
  const { applyDefaultCurrencyIfUntouched, freshDraftToken } = onboarding;

  // True multi-currency V1's fresh-draft-default boundary: the one place
  // that applies the default currency (saved preference, else device
  // locale) to a genuinely blank draft — see contexts/onboarding-
  // context.tsx's own comment on applyDefaultCurrencyIfUntouched for why
  // this lives here (this is the one component that already legitimately
  // has both useAuth() and useOnboarding() in scope) rather than inside
  // OnboardingProvider itself. Re-runs whenever the saved preference
  // resolves/changes (profile loads asynchronously) or a fresh draft
  // starts (freshDraftToken, bumped by every resetDraft() call) — either
  // way, applyDefaultCurrencyIfUntouched itself is a no-op the instant the
  // current draft's currency has already been explicitly touched.
  useEffect(() => {
    applyDefaultCurrencyIfUntouched(profile?.preferredCurrency ?? null);
  }, [applyDefaultCurrencyIfUntouched, profile?.preferredCurrency, freshDraftToken]);

  // undefined = no authenticated identity observed yet this app session, so
  // there is nothing of a *previous* user's to clear. Only a transition away
  // from a previously-known signed-in id (to signed-out, or directly to a
  // different id) is a leak risk; signing in for the first time must not
  // wipe an in-progress anonymous draft — that draft is exactly what the
  // user is trying to save by signing in.
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (status === 'loading') return;
    const currentUserId = status === 'signed_in' ? (user?.id ?? null) : null;
    const previous = previousUserId.current;
    if (typeof previous === 'string' && previous !== currentUserId) {
      onboarding.resetDraft();
    }
    previousUserId.current = currentUserId;
  }, [onboarding, status, user]);

  if (status === 'loading') {
    return <View style={styles.loading} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="legal" />
      <Stack.Screen name="support" />
      <Stack.Screen name="account-deleted" />
      <Stack.Protected guard={status === 'signed_in'}>
        <Stack.Screen name="account" />
        <Stack.Screen name="home" />
        <Stack.Screen name="playbook" />
      </Stack.Protected>
      <Stack.Screen
        name="create"
        options={{
          animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="challenge"
        options={{
          animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom',
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: theme.colors.ink },
});
