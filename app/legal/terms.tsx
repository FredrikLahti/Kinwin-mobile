// Route infrastructure only — deliberately NOT linked from Account
// settings or any other shipping navigation (see the Legal section in
// app/account/index.tsx). No real Terms of Service exist yet, and showing
// an unfinished page to real users under the "Terms" name would be
// misleading, so this page states its own status plainly instead of
// presenting placeholder legal language as if it were final. Reachable
// only by a direct link, for internal review while real Terms are drafted.
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

export default function TermsOfServiceScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityHint="Goes back" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={s.backButton}>
          <Text style={s.backIcon}>{'‹'}</Text>
        </Pressable>
        <Text style={s.wordmark}>KINWIN</Text>
        <Text accessibilityRole="header" style={s.title}>Terms of Service</Text>

        <View style={s.notice}>
          <Text style={s.noticeLabel}>NOT READY: INTERNAL PLACEHOLDER ONLY</Text>
          <Text style={s.noticeBody}>
            Kinwin does not have a finished Terms of Service yet. This page exists only so the route is ready once real Terms are written and legally reviewed. It is not linked anywhere in the app, and nothing on it should be treated as a binding agreement.
          </Text>
          <Text style={s.noticeBody}>
            The consequence-consent language shown during challenge creation and payment setup already discloses the specific data points a final Terms document must convey (see docs/PRODUCT_DECISIONS.md), but that in-app copy is also not final legal wording.
          </Text>
        </View>

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
  notice: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep, padding: 16, gap: 10, marginTop: 6 },
  noticeLabel: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  noticeBody: { color: theme.colors.ivory, fontSize: 13, lineHeight: 19 },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong, marginTop: 10 },
  secondaryText: { color: theme.colors.ivoryMuted, fontWeight: '700', fontSize: 14 },
});
