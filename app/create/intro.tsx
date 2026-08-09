import AsyncStorage from '@react-native-async-storage/async-storage';
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic } from '@/lib/haptics';

const SEEN_KEY = 'kinwin.seenChallengeIntro';

const STEPS = [
  'You make a promise.',
  'You choose what’s at stake.',
  'Succeed — nothing is charged.',
  'Miss it — someone you care about gets the reward. You sit it out.',
];

export default function CreateIntroScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(SEEN_KEY).then((value) => {
      if (cancelled) return;
      if (value === '1') {
        router.replace('/create/goal' as Href);
        return;
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  const continueToGoal = () => {
    void playImportantHaptic();
    void AsyncStorage.setItem(SEEN_KEY, '1');
    router.replace('/create/goal' as Href);
  };

  if (!ready) return <View style={styles.blank} />;

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.main}>
          <Text style={styles.wordmark}>KINWIN</Text>
          <Text accessibilityRole="header" style={styles.headline}>How it works</Text>
          <View style={styles.steps}>
            {STEPS.map((step, index) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
        <PrimaryButtonV2
          accessibilityHint="Starts creating your challenge"
          label="Got it"
          onPress={continueToGoal}
          reducedMotion={reducedMotion}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: theme.colors.ink },
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium, paddingTop: theme.spacing.large, paddingBottom: theme.spacing.small,
  },
  main: { gap: 28 },
  wordmark: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  headline: { color: theme.colors.ivory, fontSize: 30, fontWeight: '700' },
  steps: { gap: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.crimson,
    color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 24,
  },
  stepText: { flex: 1, color: theme.colors.ivory, fontSize: 18, fontWeight: '600', lineHeight: 25, paddingTop: 2 },
});
