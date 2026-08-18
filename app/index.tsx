import { Href, Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export default function HomeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { status } = useAuth();

  if (status === 'signed_in') {
    return <Redirect href="/home" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityHint="Opens sign in and sign up"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/auth' as Href)}
            >
              <Text style={styles.authLink}>Sign in</Text>
            </Pressable>
          </View>

          <View style={styles.copy}>
            <Text style={styles.title}>Kinwin</Text>
          </View>

          <View style={styles.action}>
            <PrimaryButtonV2
              accessibilityHint="Opens the first Kinwin onboarding step"
              label="Start challenge"
              onPress={() => router.push('/create/intro' as Href)}
              reducedMotion={reducedMotion}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.ink,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: 28,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  authLink: {
    flexShrink: 1,
    color: theme.colors.ivoryMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  copy: {
    paddingVertical: 40,
  },
  title: {
    color: theme.colors.ivory,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  action: {
    gap: 8,
  },
});
