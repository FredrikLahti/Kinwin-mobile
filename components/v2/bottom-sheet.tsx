import { ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type BottomSheetV2Props = {
  children: ReactNode;
  onClose: () => void;
  reducedMotion: boolean;
  visible: boolean;
};

export function BottomSheetV2({ children, onClose, reducedMotion, visible }: BottomSheetV2Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reducedMotion ? 0 : theme.motion.standard });
      return;
    }
    if (mounted) {
      progress.value = withTiming(0, { duration: reducedMotion ? 0 : theme.motion.quick }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // mounted is intentionally excluded: this effect only needs to react to
    // `visible` changing, not to the exit animation's own completion flipping it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6 }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress.value) * 32 }],
  }));

  if (!mounted) return null;

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible={mounted}>
      <View style={styles.container}>
        <Pressable
          accessibilityHint="Closes this sheet"
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View
          style={[styles.panel, panelStyle, { paddingBottom: insets.bottom + theme.spacing.medium }]}
        >
          <View accessibilityElementsHidden aria-hidden importantForAccessibility="no" style={styles.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.medium,
    paddingTop: theme.spacing.small,
    gap: theme.spacing.medium,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.structureLineStrong,
  },
});
