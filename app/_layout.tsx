import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="onboarding"
          options={{
            animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom',
            gestureEnabled: true,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
