import { Stack } from 'expo-router';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

export default function CreateLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade_from_bottom',
        gestureEnabled: true,
        // React Navigation's native-stack defaults each screen's own
        // container to white; without this, that default shows through
        // during every transition — a white flash between dark screens.
        contentStyle: { backgroundColor: theme.colors.ink },
      }}
    >
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
