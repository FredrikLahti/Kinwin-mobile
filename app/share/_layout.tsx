import { Stack } from 'expo-router';

export default function ShareLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="message" />
      <Stack.Screen name="preview" />
      <Stack.Screen name="activate" />
    </Stack>
  );
}
