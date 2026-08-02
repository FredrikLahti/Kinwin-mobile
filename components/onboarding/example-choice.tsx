import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kinwinTheme as theme } from '@/constants/theme';

type ExampleChoiceProps = {
  index: number;
  isLast: boolean;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
  selected: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ExampleChoice({
  index,
  isLast,
  label,
  onPress,
  reducedMotion,
  selected,
}: ExampleChoiceProps) {
  const pressedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityHint="Fills the goal field with this editable example"
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={3}
      onPress={onPress}
      onPressIn={() => {
        pressedScale.value = withTiming(0.98, { duration: theme.motion.quick });
      }}
      onPressOut={() => {
        pressedScale.value = withTiming(1, { duration: theme.motion.quick });
      }}
      style={[
        styles.choice,
        !isLast && styles.choiceDivider,
        selected && styles.selectedChoice,
        animatedStyle,
      ]}
    >
      <Text aria-hidden style={[styles.mark, selected && styles.selectedMark]}>
        {['△', '☾', '◷'][index]}
      </Text>
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
      <View aria-hidden style={[styles.selectionRule, selected && styles.selectedRule]} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: 106,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  choiceDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.structureLineStrong,
  },
  selectedChoice: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  mark: {
    minHeight: 30,
    color: theme.colors.copper,
    fontSize: 27,
    fontWeight: '300',
    lineHeight: 30,
  },
  selectedMark: {
    color: theme.colors.copperBright,
  },
  label: {
    minHeight: 40,
    marginTop: 8,
    color: theme.colors.boneMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  selectedLabel: {
    color: theme.colors.bone,
  },
  selectionRule: {
    width: 18,
    height: 1,
    marginTop: 9,
    backgroundColor: 'transparent',
  },
  selectedRule: {
    width: 34,
    backgroundColor: theme.colors.copperBright,
    opacity: 1,
  },
});
