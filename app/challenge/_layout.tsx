import { Stack } from 'expo-router';

export default function ChallengeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="active" />
      <Stack.Screen name="check-in" />
      <Stack.Screen name="recovery" />
      <Stack.Screen name="playbook" />
    </Stack>
  );
}
