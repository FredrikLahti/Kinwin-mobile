import { Stack } from 'expo-router';

export default function ConsequenceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="recipients" />
      <Stack.Screen name="organizer" />
      <Stack.Screen name="experience" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
