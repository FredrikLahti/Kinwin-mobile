import { Stack } from 'expo-router';

import { OnboardingProvider } from '@/contexts/onboarding-context';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="goal" />
        <Stack.Screen name="behavior" />
        <Stack.Screen name="definition" />
        <Stack.Screen name="rhythm" />
        <Stack.Screen name="timeframe" />
        <Stack.Screen name="success" />
      </Stack>
    </OnboardingProvider>
  );
}
