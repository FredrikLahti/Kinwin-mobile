import { Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type SegmentedControlV2Props<T extends string> = {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
};

export function SegmentedControlV2<T extends string>({ onChange, options, value }: SegmentedControlV2Props<T>) {
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.precise,
  },
  segmentSelected: {
    backgroundColor: theme.colors.crimsonSurface,
  },
  label: {
    color: theme.colors.warmGrey,
    fontSize: 13,
    fontWeight: '700',
  },
  labelSelected: {
    color: theme.colors.crimsonBright,
  },
});
