import { Stack } from 'expo-router';

import { OnboardingProvider } from '@/contexts/onboarding-context';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="goal" />
        <Stack.Screen name="behavior" />
      </Stack>
    </OnboardingProvider>
  );
}
