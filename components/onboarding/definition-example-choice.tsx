import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kinwinTheme as theme } from '@/constants/theme';

type DefinitionExampleChoiceProps = {
  isLast: boolean;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
  selected: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function DefinitionExampleChoice({
  isLast,
  label,
  onPress,
  reducedMotion,
  selected,
}: DefinitionExampleChoiceProps) {
  const pressedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityHint="Uses this editable definition example"
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => {
        pressedScale.value = withTiming(0.985, { duration: theme.motion.quick });
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
      <View aria-hidden style={[styles.anchor, selected && styles.selectedAnchor]} />
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
      <Text aria-hidden style={[styles.arrow, selected && styles.selectedArrow]}>→</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  choiceDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.structureLine,
  },
  selectedChoice: {
    backgroundColor: theme.colors.surface,
  },
  anchor: {
    width: 6,
    height: 6,
    marginRight: 12,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    borderRadius: 3,
  },
  selectedAnchor: {
    borderColor: theme.colors.copperBright,
    backgroundColor: theme.colors.copperBright,
  },
  label: {
    flex: 1,
    color: theme.colors.boneMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  selectedLabel: {
    color: theme.colors.bone,
  },
  arrow: {
    marginLeft: 10,
    color: theme.colors.structureLineStrong,
    fontSize: 15,
  },
  selectedArrow: {
    color: theme.colors.copperBright,
  },
});
