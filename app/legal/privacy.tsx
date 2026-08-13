// Public, unauthenticated page — reachable from Account settings and
// directly by URL (including the web export, no sign-in required). Content
// is a factual DRAFT derived strictly from docs/PRIVACY_DATA_INVENTORY.md;
// every statement here should trace back to that document. This is not a
// final, legally reviewed privacy policy — see the notice at the top of
// the page itself.
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type Section = { readonly heading: string; readonly body: readonly string[] };

const SECTIONS: readonly Section[] = [
  {
    heading: 'Account & identity',
    body: [
      'Your email address and password are used to sign you in and are managed by our authentication provider, Supabase.',
      'Your display name (optional) and an automatically generated Kin code are stored so Kin can recognize and add you.',
    ],
  },
  {
    heading: 'Challenge data',
    body: [
      'The goal, behavior, measurement rule, duration, and check-ins you enter are stored to run the core commitment mechanic and are visible to you.',
      'Personal Playbook entries you write are private to you.',
    ],
  },
  {
    heading: 'Kin & social activity',
    body: [
      'Kin connections, requests, and blocks you create are stored to run the Kin feature.',
      'When your challenge starts, succeeds, or fails, that event is visible to your accepted Kin. Reactions your Kin leave on your activity are stored and linked to their account.',
      'Kinwin does not currently support limiting activity visibility to a subset of your Kin. Any accepted Kin can see your current-challenge activity.',
    ],
  },
  {
    heading: 'Payments',
    body: [
      'Your card details are entered directly into our payment processor Stripe’s own secure form and never pass through Kinwin’s servers or database. Kinwin stores only Stripe’s own reference identifiers (customer, payment method, and payment references) and the amount/currency you set.',
      'Kinwin is currently in a TEST/beta phase: no real money moves through the app. All Stripe activity uses Stripe’s test mode.',
    ],
  },
  {
    heading: 'Recipients, organizers, and rewards',
    body: [
      'If your challenge fails, the recipients and reward organizer you name (by display name only; we do not collect their email, phone number, or address) can access a private page using a one-time link. We store only a hashed version of that link’s token, never the raw link itself.',
      'Reward fulfillment uses Tremendous, a third-party rewards provider. Kinwin sends Tremendous the organizer’s display name and the reward amount/currency, and nothing else. Kinwin is currently in a TEST/sandbox phase with Tremendous: no real reward has been or can currently be issued.',
    ],
  },
  {
    heading: 'What we do not collect',
    body: [
      'Kinwin does not use analytics, advertising, or crash-reporting software of any kind. We do not track you across other apps or websites, and we do not sell or share your data with data brokers.',
      'We do not access your device’s contact list. We do not collect location data.',
    ],
  },
  {
    heading: 'Third parties who process data on our behalf',
    body: [
      'Supabase (database, authentication, and backend functions), Stripe (payments), Tremendous (reward fulfillment), and Expo/EAS (app hosting and distribution). Each processes only the data described above, only to provide Kinwin’s own functionality to you.',
    ],
  },
  {
    heading: 'Data retention & deletion',
    body: [
      'Kinwin has not yet finalized retention periods or an account-deletion feature. This is being worked out carefully because deleting an account must not erase an unresolved financial obligation or a reward still owed to someone else. Account deletion is planned before Kinwin is available to the public.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'Questions about this page can be sent through the Support option in Account settings, once a support contact address is configured.',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityHint="Goes back" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={s.backButton}>
          <Text style={s.backIcon}>{'‹'}</Text>
        </Pressable>
        <Text style={s.wordmark}>KINWIN</Text>
        <Text accessibilityRole="header" style={s.title}>Privacy</Text>

        <View style={s.draftNotice}>
          <Text style={s.draftLabel}>FACTUAL DRAFT: NOT YET LEGALLY REVIEWED</Text>
          <Text style={s.draftBody}>
            This page describes, in plain language, what Kinwin’s beta actually collects and does today, based directly on our internal data inventory. It is not a final, lawyer-approved privacy policy, and it will be replaced with one before Kinwin is available to the public.
          </Text>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.heading} style={s.section}>
            <Text style={s.sectionHeading}>{section.heading}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} style={s.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}

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
  draftNotice: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep, padding: 16, gap: 6, marginTop: 6 },
  draftLabel: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  draftBody: { color: theme.colors.ivory, fontSize: 13, lineHeight: 19 },
  section: { gap: 6, marginTop: 8 },
  sectionHeading: { color: theme.colors.ivory, fontSize: 16, fontWeight: '800' },
  paragraph: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong, marginTop: 10 },
  secondaryText: { color: theme.colors.ivoryMuted, fontWeight: '700', fontSize: 14 },
});
