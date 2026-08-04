import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ChallengePreviewProvider } from '@/contexts/challenge-preview-context';
import { OnboardingProvider } from '@/contexts/onboarding-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <ChallengePreviewProvider>
          <AuthGate />
        </ChallengePreviewProvider>
        <StatusBar style="auto" />
      </OnboardingProvider>
    </AuthProvider>
  );
}

// Session restoration must resolve before any protected-route decision is
// made, so a deep link into a protected screen never flashes its content
// (or bounces away) while `getSession()` is still in flight.
function AuthGate() {
  const { status } = useAuth();

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
