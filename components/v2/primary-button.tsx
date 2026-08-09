import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type PrimaryButtonV2Props = {
  accessibilityHint: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButtonV2({
  accessibilityHint,
  disabled = false,
  label,
  onPress,
  reducedMotion,
}: PrimaryButtonV2Props) {
  const pressedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  const setPressed = (isPressed: boolean) => {
    pressedScale.value = withTiming(isPressed ? 0.97 : 1, { duration: theme.motion.quick });
  };

  return (
    <AnimatedPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.button, disabled ? styles.disabled : styles.enabled, animatedStyle]}
    >
      <Text style={[styles.label, disabled && styles.disabledLabel]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.controlled,
  },
  // Primary actions are never destructive-looking: muted brass/antique-gold
  // fill, dark text. Crimson is reserved for cancel/delete/destructive
  // confirmation — see constants/theme-v2.ts's locked color semantics.
  enabled: {
    backgroundColor: theme.colors.brass,
  },
  disabled: {
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
  },
  label: {
    color: theme.colors.ink,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabledLabel: {
    color: theme.colors.warmGrey,
  },
});
