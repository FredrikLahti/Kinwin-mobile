import { Pressable, StyleSheet, Text } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type SecondaryButtonV2Props = {
  accessibilityHint: string;
  label: string;
  onPress: () => void;
};

export function SecondaryButtonV2({ accessibilityHint, label, onPress }: SecondaryButtonV2Props) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.controlled,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  label: {
    color: theme.colors.ivoryMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
