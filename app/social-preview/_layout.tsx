import { Stack } from 'expo-router';

import { kinwinTheme as theme } from '@/constants/theme';

export default function SocialPreviewLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.ink },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-kin" options={{ presentation: 'modal' }} />
      <Stack.Screen name="challenge-room" />
      <Stack.Screen name="audience-preview" />
    </Stack>
  );
}
