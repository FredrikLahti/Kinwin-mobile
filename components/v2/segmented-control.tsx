import { Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type SegmentedControlV2Props<T extends string> = {
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
};

/** `disabled` is for a control whose selection is being persisted elsewhere (e.g. a server write in flight) — it blocks every segment and dims the whole track, so a second tap can never race the first write. */
export function SegmentedControlV2<T extends string>({ disabled = false, onChange, options, value }: SegmentedControlV2Props<T>) {
  return (
    <View accessibilityRole="tablist" style={[styles.track, disabled && styles.trackDisabled]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
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
  trackDisabled: {
    opacity: 0.5,
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
