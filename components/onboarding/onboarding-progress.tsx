import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kinwinTheme as theme } from '@/constants/theme';

type OnboardingProgressProps = {
  currentStep: number;
  reducedMotion: boolean;
  settled: boolean;
  totalSteps: number;
};

export function OnboardingProgress({
  currentStep,
  reducedMotion,
  settled,
  totalSteps,
}: OnboardingProgressProps) {
  const settledProgress = useSharedValue(settled ? 1 : 0.985);

  useEffect(() => {
    settledProgress.value = withTiming(settled ? 1 : 0.985, {
      duration: reducedMotion ? 0 : theme.motion.standard,
      easing: Easing.out(Easing.cubic),
    });
  }, [reducedMotion, settled, settledProgress]);

  const activeSegmentStyle = useAnimatedStyle(() => ({
    opacity: settled ? 1 : 0.76,
    transform: [{ scaleX: settledProgress.value }],
  }));

  const nodeStyle = useAnimatedStyle(() => ({
    opacity: settled ? 1 : 0.82,
  }));

  return (
    <View
      accessibilityLabel={`Step ${currentStep} of ${totalSteps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 1,
        max: totalSteps,
        now: currentStep,
        text: `Step ${currentStep} of ${totalSteps}`,
      }}
      style={styles.container}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.visual}
      >
        <View style={styles.track} />
        <Animated.View style={[styles.activeSegment, activeSegmentStyle]} />
        <View style={styles.knot}>
          <View style={[styles.knotLine, styles.knotLineOne]} />
          <View style={[styles.knotLine, styles.knotLineTwo]} />
          <View style={styles.knotCore} />
        </View>
        <Animated.View style={[styles.anchorNode, nodeStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    justifyContent: 'center',
  },
  visual: {
    position: 'relative',
    height: 40,
  },
  track: {
    position: 'absolute',
    top: 18,
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.structureLineStrong,
    opacity: 0.28,
  },
  activeSegment: {
    position: 'absolute',
    left: 0,
    top: 18,
    width: '100%',
    height: 1.25,
    backgroundColor: theme.colors.copper,
    transformOrigin: 'left center',
  },
  knot: {
    position: 'absolute',
    left: '47%',
    top: 10,
    width: 38,
    height: 19,
  },
  knotLine: {
    position: 'absolute',
    left: 1,
    top: 8,
    width: 36,
    height: 1,
    backgroundColor: theme.colors.copperBright,
  },
  knotLineOne: {
    transform: [{ rotate: '12deg' }],
  },
  knotLineTwo: {
    transform: [{ rotate: '-12deg' }],
  },
  knotCore: {
    position: 'absolute',
    left: 16,
    top: 6,
    width: 6,
    height: 5,
    borderWidth: 1,
    borderColor: theme.colors.copper,
    borderRadius: 3,
    backgroundColor: theme.colors.ink,
    transform: [{ rotate: '15deg' }],
  },
  anchorNode: {
    position: 'absolute',
    right: '15%',
    top: 14.5,
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: theme.colors.copperBright,
    borderRadius: 4,
    backgroundColor: theme.colors.copper,
  },
});
