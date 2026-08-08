import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PreviewTagV2 } from '@/components/v2/preview-tag';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { demoTodayChallenge } from '@/fixtures/ux-v2-preview';

type DemoCheckInSheetV2Props = {
  onClose: () => void;
};

// Visual-only twin of components/v2/check-in-sheet.tsx: same interaction
// shape (Yes / Not today -> compact success state), but purely local
// component state — it never touches ChallengePreviewProvider, so tapping
// through the demo TODAY card can never write a fake completion into real
// preview state.
export function DemoCheckInSheetV2({ onClose }: DemoCheckInSheetV2Props) {
  const reducedMotion = useReducedMotion();
  const [checkedIn, setCheckedIn] = useState(false);

  if (checkedIn) {
    return (
      <View style={styles.content}>
        <PreviewTagV2 />
        <Text style={styles.behavior}>{demoTodayChallenge.name}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Checked in.</Text>
        <Text style={styles.progressLine}>{demoTodayChallenge.progressLine}</Text>
        <PrimaryButtonV2 accessibilityHint="Closes this sheet" label="Done" onPress={onClose} reducedMotion={reducedMotion} />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <PreviewTagV2 />
      <Text style={styles.behavior}>{demoTodayChallenge.name}</Text>
      <Text accessibilityRole="header" style={styles.headline}>Did you do this today?</Text>
      <PrimaryButtonV2 accessibilityHint="Records this as complete in the preview" label="Yes" onPress={() => setCheckedIn(true)} reducedMotion={reducedMotion} />
      <SecondaryButtonV2 accessibilityHint="Closes without recording anything" label="Not today" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.small, paddingBottom: theme.spacing.small },
  behavior: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  headline: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  progressLine: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
});
