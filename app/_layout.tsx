import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { OnboardingProvider } from '@/contexts/onboarding-context';

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
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
      <StatusBar style="auto" />
    </OnboardingProvider>
  );
}
