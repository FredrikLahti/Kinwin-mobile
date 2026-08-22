import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type ProgressBarV2Props = {
  percent: number;
  reducedMotion?: boolean;
};

const FILL_DURATION_MS = 320;

/**
 * The primary visual follow-through for an ordinary check-in: the fill
 * animates from its previous percentage to the new one, restrained
 * (`withTiming`, no spring/overshoot). Starts already at the real value on
 * mount — opening Home must never show the bar sweeping up from zero, only
 * a genuine later change should visibly transition. A second change
 * arriving before the first finishes simply retargets the same in-flight
 * animation toward the new value, so there is nothing to get stale or race.
 */
export function ProgressBarV2({ percent, reducedMotion = false }: ProgressBarV2Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.value = reducedMotion ? clamped : withTiming(clamped, { duration: FILL_DURATION_MS });
  }, [clamped, reducedMotion, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: clamped }} style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

type WeekBarsV2Props = {
  weeks: readonly { label: string; value: number }[];
};

const CHART_HEIGHT = 56;

export function WeekBarsV2({ weeks }: WeekBarsV2Props) {
  return (
    <View style={styles.chart}>
      {weeks.map((week) => (
        <View key={week.label} style={styles.column}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                { height: Math.max(4, (Math.max(0, Math.min(100, week.value)) / 100) * CHART_HEIGHT) },
              ]}
            />
          </View>
          <Text style={styles.weekLabel}>{week.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.structureLineStrong,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.colors.crimson,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.small,
    height: CHART_HEIGHT + 22,
  },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: {
    width: '100%',
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.colors.structureLine,
  },
  bar: {
    width: '100%',
    backgroundColor: theme.colors.crimson,
    borderRadius: 4,
  },
  weekLabel: {
    color: theme.colors.warmGrey,
    fontSize: 10,
    fontWeight: '700',
  },
});
