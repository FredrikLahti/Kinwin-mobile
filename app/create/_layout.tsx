import { Stack } from 'expo-router';

export default function CreateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom', gestureEnabled: true }}>
      <Stack.Screen name="goal" />
      <Stack.Screen name="promise" />
      <Stack.Screen name="rhythm" />
      <Stack.Screen name="duration" />
      <Stack.Screen name="consequence" />
      <Stack.Screen name="recipients" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
