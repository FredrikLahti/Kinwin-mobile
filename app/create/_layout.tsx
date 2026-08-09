import { Stack } from 'expo-router';

export default function CreateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom', gestureEnabled: true }}>
      <Stack.Screen name="intro" />
      <Stack.Screen name="goal" />
      <Stack.Screen name="type" />
      <Stack.Screen name="build" />
      <Stack.Screen name="frequency" />
      <Stack.Screen name="limit" />
      <Stack.Screen name="avoid" />
      <Stack.Screen name="duration" />
      <Stack.Screen name="recipients" />
      <Stack.Screen name="consequence" />
      <Stack.Screen name="review" />
      <Stack.Screen name="share" />
    </Stack>
  );
}
