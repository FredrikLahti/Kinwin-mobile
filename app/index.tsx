import { Href, Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/contexts/auth-context';

export default function HomeScreen() {
  const router = useRouter();
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
            <Text style={styles.version}>Mobile V1</Text>
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
            <Text style={styles.tagline}>When you fail, your loved ones win.</Text>
            <Text style={styles.eyebrow}>A new beginning</Text>
          </View>

          <View style={styles.action}>
            <PrimaryButton
              accessibilityHint="Opens the first Kinwin onboarding step"
              label="Start"
              onPress={() => router.push('/onboarding/goal' as Href)}
            />
            <Pressable
              accessibilityHint="Opens the internal Kin social prototype, using local preview data only"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/social-preview' as Href)}
            >
              <Text style={styles.socialPreviewLink}>Kin social preview (internal prototype)</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Opens the internal social onboarding UX prototype, using local preview data only"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/social-onboarding-preview' as Href)}
            >
              <Text style={styles.socialPreviewLink}>Social onboarding UX preview (internal prototype)</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Opens the internal active-challenge check-in UX prototype, using local fixture data only"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/challenge-ux-preview' as Href)}
            >
              <Text style={styles.socialPreviewLink}>Challenge check-in UX preview (internal prototype)</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Temporary screen-specific styling; this is not Kinwin's final visual identity.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F1',
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
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  version: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C9C9C3',
    borderRadius: 999,
    color: '#4C4C48',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  authLink: {
    flexShrink: 1,
    color: '#343432',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  copy: {
    gap: 16,
    paddingVertical: 40,
  },
  title: {
    color: '#191918',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  tagline: {
    maxWidth: 360,
    color: '#343432',
    fontSize: 24,
    lineHeight: 32,
  },
  eyebrow: {
    color: '#62625D',
    fontSize: 16,
    lineHeight: 24,
  },
  action: {
    gap: 8,
  },
  socialPreviewLink: {
    minHeight: 20,
    color: '#62625D',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
