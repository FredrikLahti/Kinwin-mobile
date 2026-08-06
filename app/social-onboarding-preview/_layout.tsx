import { Stack } from 'expo-router';

import { kinwinTheme as theme } from '@/constants/theme';
import { SocialOnboardingProvider } from '@/contexts/social-onboarding-context';

export default function SocialOnboardingPreviewLayout() {
  return (
    <SocialOnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.ink },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="cold-start" />
        <Stack.Screen name="username" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-kin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="invite" />
        <Stack.Screen name="incoming-request" />
        <Stack.Screen name="remove-kin" />
        <Stack.Screen name="challenge-audience" />
        <Stack.Screen name="existing-solo-challenge" />
      </Stack>
    </SocialOnboardingProvider>
  );
}
