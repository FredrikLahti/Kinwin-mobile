import { Href, Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntranceTransitionV2 } from '@/components/v2/entrance-transition';
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
      {/* Deliberately minimal, easy-to-throw-away background treatment. A
          real color-palette/theme direction is still being decided
          separately (see docs/PRODUCT_DECISIONS.md), so this only reuses
          existing kinwinThemeV2 tokens at low opacity, never a new color,
          and will likely be revisited once that direction lands. */}
      <View aria-hidden pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.glow, styles.glowUpper]} />
        <View style={[styles.glow, styles.glowLower]} />
      </View>
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

          <EntranceTransitionV2 play reducedMotion={reducedMotion}>
            <View style={styles.copy}>
              <Text style={styles.title}>Kinwin</Text>
            </View>
          </EntranceTransitionV2>

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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
  },
  glowUpper: {
    top: -220,
    right: -160,
    backgroundColor: theme.colors.oxbloodDeep,
    opacity: 0.55,
  },
  glowLower: {
    bottom: -260,
    left: -200,
    backgroundColor: theme.colors.oxblood,
    opacity: 0.3,
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
