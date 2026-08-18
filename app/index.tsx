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
            <Text style={styles.eyebrow}>A new beginning</Text>
          </View>

          <View style={styles.action}>
            <PrimaryButton
              accessibilityHint="Opens the first Kinwin onboarding step"
              label="Start"
              onPress={() => router.push('/create/intro' as Href)}
            />
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
    justifyContent: 'flex-end',
    gap: 12,
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
  eyebrow: {
    color: '#62625D',
    fontSize: 16,
    lineHeight: 24,
  },
  action: {
    gap: 8,
  },
});
