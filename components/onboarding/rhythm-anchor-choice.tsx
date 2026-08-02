import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kinwinTheme as theme } from '@/constants/theme';

type RhythmAnchorChoiceProps = {
  compact?: boolean;
  description: string;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
  selected: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function RhythmAnchorChoice({
  compact = false,
  description,
  label,
  onPress,
  reducedMotion,
  selected,
}: RhythmAnchorChoiceProps) {
  const pressedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityHint={description}
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
        compact && styles.compactChoice,
        selected && styles.selectedChoice,
        animatedStyle,
      ]}
    >
      <View aria-hidden style={styles.anchorZone}>
        <View style={[styles.anchor, selected && styles.selectedAnchor]}>
          <View style={[styles.anchorCore, selected && styles.selectedAnchorCore]} />
        </View>
      </View>
      <Text
        style={[
          styles.label,
          compact && styles.compactLabel,
          selected && styles.selectedLabel,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.description,
          compact && styles.compactDescription,
          selected && styles.selectedDescription,
        ]}
      >
        {description}
      </Text>
      <View aria-hidden style={[styles.selectionRule, selected && styles.selectedRule]} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: 142,
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingBottom: 10,
  },
  compactChoice: {
    minHeight: 91,
  },
  selectedChoice: {
    backgroundColor: theme.colors.surface,
  },
  anchorZone: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchor: {
    width: 11,
    height: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    borderRadius: 6,
    backgroundColor: theme.colors.deepInk,
  },
  selectedAnchor: {
    width: 15,
    height: 15,
    borderColor: theme.colors.copperBright,
    borderRadius: 8,
  },
  anchorCore: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.warmGrey,
  },
  selectedAnchorCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.copperBright,
  },
  label: {
    minHeight: 38,
    color: theme.colors.boneMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  compactLabel: {
    minHeight: 22,
  },
  selectedLabel: {
    color: theme.colors.bone,
  },
  description: {
    minHeight: 50,
    marginTop: 4,
    color: theme.colors.warmGrey,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  compactDescription: {
    minHeight: 28,
  },
  selectedDescription: {
    color: theme.colors.boneMuted,
  },
  selectionRule: {
    width: 18,
    height: 1,
    marginTop: 'auto',
    backgroundColor: 'transparent',
  },
  selectedRule: {
    width: 34,
    backgroundColor: theme.colors.copperBright,
  },
});
