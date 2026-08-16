// Public completion screen for account deletion — deliberately outside
// app/account (which lives under app/_layout.tsx's
// `Stack.Protected guard={status === 'signed_in'}`). By the time a user
// lands here, delete-account.tsx has already signed them out locally, so a
// screen gated on being signed in could never host this state cleanly. See
// docs/ACCOUNT_DELETION_DECISIONS.md.
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { playSelectionHaptic } from '@/lib/haptics';

export default function AccountDeletedScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Your account has been deleted</Text>
          <Text style={styles.body}>
            Your challenge history, check-ins, Playbook entries, social activity, and Kin connections have been permanently removed. You are signed out.
          </Text>
          <Pressable
            accessibilityHint="Returns to the start"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); router.replace('/' as Href); }}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Continue</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  content: {
    flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.large, gap: 16,
  },
  title: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700' },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
  },
  buttonPressed: { backgroundColor: theme.colors.surface },
  buttonLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '700' },
});
