import { Stack } from 'expo-router';

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pending-commitment" />
      <Stack.Screen name="payment-setup" />
      <Stack.Screen name="payment-recovery" />
      <Stack.Screen name="delete-account" />
    </Stack>
  );
}
