import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  const { height: windowHeight } = useWindowDimensions();
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

  // behavior="padding" is the standard RN idiom for a Modal that must stay
  // above the keyboard: it shrinks this container by the keyboard's
  // height, and since the container's own justifyContent:'flex-end'
  // already pushes the panel to the bottom, the panel rises above the
  // keyboard automatically as it opens and closes, with no device-
  // specific offset. Android's Modal already resizes for the keyboard on
  // its own, so this only applies on iOS.
  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible={mounted}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
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
          style={[styles.panel, { maxHeight: windowHeight * 0.85 }, panelStyle, { paddingBottom: insets.bottom + theme.spacing.medium }]}
        >
          <View accessibilityElementsHidden aria-hidden importantForAccessibility="no" style={styles.grabber} />
          {/* A capped panel height plus a flexShrink ScrollView is what
              actually makes content scroll instead of just growing past
              the screen -- needed once the keyboard has already taken a
              large bite out of the available height (e.g. a long person-
              search result list). keyboardShouldPersistTaps="handled" so
              tapping a result/action while the keyboard is open doesn't
              swallow the first tap as a keyboard-dismiss. */}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scrollBody}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
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
  scrollBody: {
    flexShrink: 1,
  },
});
