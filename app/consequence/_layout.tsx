import { Stack } from 'expo-router';

export default function ConsequenceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="recipients" />
    </Stack>
  );
}
