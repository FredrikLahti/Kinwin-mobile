import { Stack } from 'expo-router';

import { kinwinTheme as theme } from '@/constants/theme';
import { ChallengeUxPreviewProvider } from '@/contexts/challenge-ux-preview-context';

export default function ChallengeUxPreviewLayout() {
  return (
    <ChallengeUxPreviewProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.ink } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="check-in" />
        <Stack.Screen name="result" />
      </Stack>
    </ChallengeUxPreviewProvider>
  );
}
