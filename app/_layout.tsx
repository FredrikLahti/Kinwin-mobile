import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ChallengePreviewProvider } from '@/contexts/challenge-preview-context';
import { OnboardingProvider, useOnboarding } from '@/contexts/onboarding-context';
import { StripeProvider } from '@/lib/stripe/native-stripe';
import { readStripeConfig } from '@/lib/stripe/config';

export default function RootLayout() {
  const stripeConfig = readStripeConfig();
  return (
    // A missing publishable key never blocks the rest of the app: the real
    // StripeProvider only calls native init when publishableKey is truthy
    // (see @stripe/stripe-react-native's own source), and the web build of
    // this component ignores it entirely — payment-setup.tsx is what
    // actually reports "not configured" honestly.
    <StripeProvider publishableKey={stripeConfig?.publishableKey ?? ''} urlScheme="kinwin">
      <AuthProvider>
        <OnboardingProvider>
          <ChallengePreviewProvider>
            <AuthGate />
          </ChallengePreviewProvider>
          <StatusBar style="auto" />
        </OnboardingProvider>
      </AuthProvider>
    </StripeProvider>
  );
}

// Session restoration must resolve before any protected-route decision is
// made, so a deep link into a protected screen never flashes its content
// (or bounces away) while `getSession()` is still in flight.
function AuthGate() {
  const { status, user } = useAuth();
  const onboarding = useOnboarding();

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
      <Stack.Protected guard={status === 'signed_in'}>
        <Stack.Screen name="account" />
      </Stack.Protected>
      <Stack.Screen
        name="onboarding"
        options={{
          animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="consequence"
        options={{
          animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="share"
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
