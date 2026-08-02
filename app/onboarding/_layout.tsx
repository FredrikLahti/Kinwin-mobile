import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="goal" />
      <Stack.Screen name="behavior" />
      <Stack.Screen name="definition" />
      <Stack.Screen name="rhythm" />
      <Stack.Screen name="timeframe" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
