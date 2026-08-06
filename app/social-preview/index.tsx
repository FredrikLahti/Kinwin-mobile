import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { kinwinTheme as theme } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic } from '@/lib/haptics';

export default function SocialPreviewEntry() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const enter = () => {
    void playImportantHaptic();
    router.push('/social-preview/(tabs)' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the Kinwin welcome screen"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>INTERNAL PROTOTYPE</Text>
          <Text style={styles.noticeTitle}>Illustrative only — nothing here is saved.</Text>
          <Text style={styles.noticeBody}>
            Every person, Kinship, challenge, comment, and reaction on the following screens is
            local fixture data for evaluating the social experience. Nothing is sent to a server,
            nothing persists between sessions, and no real network requests are made — reloading
            resets everything you do here.
          </Text>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>KIN · SOCIAL PROTOTYPE</Text>
          <Text style={styles.title}>See Kinwin as a private circle, not a habit tracker.</Text>
          <Text style={styles.subtitle}>
            A feed of real commitments, a friends-only network, and one full Challenge Room —
            built to evaluate the experience before any of it is wired to a real backend.
          </Text>
        </View>

        <View style={styles.actions}>
          <AnimatedPrimaryButton
            accessibilityHint="Opens the Kin feed and My Kin prototype"
            label="Enter Kin (preview)"
            onPress={enter}
            reducedMotion={reducedMotion}
          />

          <Pressable
            accessibilityHint="Opens the challenge audience and detail privacy preview"
            accessibilityRole="button"
            onPress={() => { void playImportantHaptic(); router.push('/social-preview/audience-preview' as Href); }}
            style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
          >
            <Text style={styles.secondaryLinkText}>Preview challenge privacy settings →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 26, paddingTop: 6,
  },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  noticeCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginTop: 22, gap: 8,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 26, marginHorizontal: 20, paddingVertical: 18,
  },
  noticeLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  noticeTitle: { color: theme.colors.bone, fontSize: 15, fontWeight: '700' },
  noticeBody: { color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 19 },
  copy: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 12, paddingHorizontal: 26, paddingTop: 34, paddingBottom: 28,
  },
  eyebrow: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 28, lineHeight: 35,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  actions: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26,
  },
  secondaryLink: {
    minHeight: 44, justifyContent: 'center', alignItems: 'center',
    marginTop: 6,
  },
  secondaryLinkPressed: { opacity: 0.7 },
  secondaryLinkText: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
});
