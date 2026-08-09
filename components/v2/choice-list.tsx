import { Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { playSelectionHaptic } from '@/lib/haptics';

export type ChoiceListOption<T extends string> = {
  description?: string;
  label: string;
  value: T;
};

type ChoiceListV2Props<T extends string> = {
  layout?: 'row' | 'stack';
  onChange: (value: T) => void;
  options: readonly ChoiceListOption<T>[];
  value: T | null;
};

export function ChoiceListV2<T extends string>({ layout = 'stack', onChange, options, value }: ChoiceListV2Props<T>) {
  const select = (next: T) => {
    void playSelectionHaptic();
    onChange(next);
  };

  return (
    <View style={layout === 'row' ? styles.row : styles.stack}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityHint={option.description}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={2}
            key={option.value}
            onPress={() => select(option.value)}
            style={({ pressed }) => [
              styles.option,
              layout === 'row' && styles.optionRow,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
          >
            <Text numberOfLines={layout === 'row' ? 2 : undefined} style={[styles.label, selected && styles.labelSelected]}>
              {option.label}
            </Text>
            {option.description && (
              <Text style={[styles.description, selected && styles.descriptionSelected]}>{option.description}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    minHeight: 60,
    justifyContent: 'center',
    borderRadius: theme.radius.controlled,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionRow: { flex: 1, alignItems: 'center' },
  optionSelected: {
    borderColor: theme.colors.crimson,
    backgroundColor: theme.colors.crimsonSurface,
  },
  optionPressed: { backgroundColor: theme.colors.surfaceFocused },
  label: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '700' },
  labelSelected: { color: theme.colors.ivory },
  description: { marginTop: 3, color: theme.colors.warmGrey, fontSize: 12, lineHeight: 17 },
  descriptionSelected: { color: theme.colors.ivoryMuted },
});
