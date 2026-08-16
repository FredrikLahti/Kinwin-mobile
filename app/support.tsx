// Public, unauthenticated page — reachable directly by URL (including the
// web export, no sign-in required), and Kinwin's App Store Connect Support
// URL (see docs/APP_STORE_SUBMISSION_PACKAGE.md). Deliberately minimal: a
// real contact channel and a link to the privacy policy, not a FAQ, not a
// ticketing system, no backend of its own.
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { readSupportConfig } from '@/lib/support/config';

export default function SupportScreen() {
  const router = useRouter();
  const supportConfig = readSupportConfig();

  const contactSupport = () => {
    if (!supportConfig) return;
    void Linking.openURL(`mailto:${supportConfig.email}?subject=${encodeURIComponent('Kinwin support')}`);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityHint="Goes back" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={s.backButton}>
          <Text style={s.backIcon}>{'‹'}</Text>
        </Pressable>
        <Text style={s.wordmark}>KINWIN</Text>
        <Text accessibilityRole="header" style={s.title}>Support</Text>

        <View style={s.section}>
          <Text style={s.paragraph}>
            Questions, problems, or feedback about Kinwin — reach us directly and a real person will get back to you.
          </Text>
        </View>

        <View style={s.section}>
          {supportConfig ? (
            <Pressable
              accessibilityHint={`Opens your email app to contact Kinwin support at ${supportConfig.email}`}
              accessibilityRole="button"
              onPress={contactSupport}
              style={({ pressed }) => [s.contactRow, pressed && s.contactRowPressed]}
            >
              <Text style={s.contactLabel}>Email Kinwin Support</Text>
              <Text style={s.contactValue}>{supportConfig.email}</Text>
            </Pressable>
          ) : (
            <Text style={s.paragraph}>Support contact is not configured in this build yet.</Text>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionHeading}>Managing your account</Text>
          <Text style={s.paragraph}>
            You can delete your Kinwin account from Account → Delete account. If you have an active challenge or an unresolved payment or reward from a failed one, deletion isn’t available until that’s resolved. Once it goes through, deletion is permanent and removes your challenge history, check-ins, Playbook entries, social activity, and Kin connections.
          </Text>
        </View>

        <Pressable
          accessibilityHint="Opens Kinwin's privacy page"
          accessibilityRole="button"
          onPress={() => router.push('/legal/privacy' as Href)}
          style={s.secondary}
        >
          <Text style={s.secondaryText}>Privacy policy</Text>
        </Pressable>

        <Pressable accessibilityHint="Returns to the previous screen" accessibilityRole="button" onPress={() => router.back()} style={s.secondary}>
          <Text style={s.secondaryText}>Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  content: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 14 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  title: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 32, lineHeight: 38, marginTop: 4 },
  section: { gap: 6, marginTop: 8 },
  sectionHeading: { color: theme.colors.ivory, fontSize: 16, fontWeight: '800' },
  paragraph: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  contactRow: {
    minHeight: 56, justifyContent: 'center', gap: 2, borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  contactRowPressed: { backgroundColor: theme.colors.surfaceRaised },
  contactLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  contactValue: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '600' },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong, marginTop: 10 },
  secondaryText: { color: theme.colors.ivoryMuted, fontWeight: '700', fontSize: 14 },
});
