import { Stack } from 'expo-router';

export default function ChallengeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="active" />
    </Stack>
  );
}
