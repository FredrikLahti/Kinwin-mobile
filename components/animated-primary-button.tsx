import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kinwinTheme as theme } from '@/constants/theme';

type AnimatedPrimaryButtonProps = {
  accessibilityHint: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AnimatedPrimaryButton({
  accessibilityHint,
  disabled = false,
  label,
  onPress,
  reducedMotion,
}: AnimatedPrimaryButtonProps) {
  const pressedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  const setPressed = (isPressed: boolean) => {
    pressedScale.value = withTiming(isPressed ? 0.985 : 1, {
      duration: theme.motion.quick,
    });
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
      style={[
        styles.button,
        disabled ? styles.disabledButton : styles.enabledButton,
        animatedStyle,
      ]}
    >
      <View aria-hidden style={[styles.leadingMark, disabled && styles.disabledLeadingMark]} />
      <Text style={[styles.label, disabled && styles.disabledLabel]}>{label}</Text>
      <View style={[styles.actionBox, disabled && styles.disabledActionBox]}>
        <Text aria-hidden style={[styles.arrow, disabled && styles.disabledArrow]}>→</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.precise,
    paddingLeft: 20,
    paddingRight: 7,
    paddingVertical: 7,
  },
  enabledButton: {
    borderColor: theme.colors.copperBright,
    backgroundColor: theme.colors.copperSurface,
  },
  disabledButton: {
    borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface,
  },
  leadingMark: {
    width: 2,
    height: 28,
    marginRight: 17,
    backgroundColor: theme.colors.copperBright,
  },
  disabledLeadingMark: {
    backgroundColor: theme.colors.structureLineStrong,
  },
  label: {
    flex: 1,
    color: theme.colors.bone,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabledLabel: {
    color: theme.colors.boneMuted,
    opacity: 0.62,
  },
  actionBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.copperBright,
    borderRadius: 2,
    backgroundColor: theme.colors.copperDeep,
  },
  disabledActionBox: {
    borderLeftColor: theme.colors.structureLine,
    backgroundColor: theme.colors.deepInk,
  },
  arrow: {
    color: theme.colors.copperBright,
    fontSize: 22,
    fontWeight: '500',
  },
  disabledArrow: {
    color: theme.colors.structureLineStrong,
  },
});
