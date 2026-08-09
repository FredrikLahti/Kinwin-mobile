import { StyleSheet, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type CreateProgressV2Props = {
  accessibilityLabel?: string;
  currentStep: number;
  totalSteps: number;
};

export function CreateProgressV2({ accessibilityLabel, currentStep, totalSteps }: CreateProgressV2Props) {
  const progressLabel = accessibilityLabel ?? `Step ${currentStep} of ${totalSteps}`;

  return (
    <View
      accessibilityLabel={progressLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: totalSteps, now: currentStep, text: progressLabel }}
      style={styles.track}
    >
      <View style={[styles.fill, { flex: currentStep }]} />
      <View style={{ flex: Math.max(0, totalSteps - currentStep) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: theme.colors.structureLine,
  },
  fill: {
    backgroundColor: theme.colors.crimson,
  },
});
