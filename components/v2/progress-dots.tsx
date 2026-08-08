import { StyleSheet, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type ProgressDotsV2Props = {
  filled: number;
  total: number;
};

const MAX_DOTS = 14;

export function ProgressDotsV2({ filled, total }: ProgressDotsV2Props) {
  if (total < 1 || total > MAX_DOTS) return null;
  const clampedFilled = Math.max(0, Math.min(filled, total));
  return (
    <View accessibilityElementsHidden aria-hidden style={styles.row}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, index < clampedFilled ? styles.dotFilled : styles.dotEmpty]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: theme.colors.crimson,
  },
  dotEmpty: {
    backgroundColor: theme.colors.structureLineStrong,
  },
});
