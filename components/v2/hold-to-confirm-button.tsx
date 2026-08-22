import { useEffect, useRef, useState } from 'react';
import { AccessibilityActionEvent, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { canBeginOrCompleteHold, shouldClearFiredGuard, shouldShowReducedMotionHoldFeedback } from '@/lib/hold-to-confirm-guard';

const HOLD_DURATION_MS = 600;

type HoldToConfirmButtonV2Props = {
  accessibilityHint: string;
  disabled?: boolean;
  label: string;
  onConfirm: () => void;
  reducedMotion: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The one deliberately "weighted" confirmation control in Kinwin — reserved
 * for the true point of no return (activating a challenge), never used for
 * ordinary buttons. A ~600ms hold, not a tap: releasing early resets
 * cleanly, completing the hold invokes `onConfirm` exactly once. This is
 * intentional friction, not entertainment — no bounce, no spring overshoot,
 * no pause after completion; `onConfirm` fires the instant the hold
 * completes and is the caller's job to turn into a real, server-confirmed
 * action (see app/account/pending-commitment.tsx's own comment on why the
 * commitment haptic waits for that server confirmation rather than firing
 * here).
 *
 * VoiceOver / screen-reader users are never required to perform the
 * physical hold: the standard React Native "activate" accessibility action
 * (what VoiceOver's double-tap already maps to on an accessible button)
 * reaches the exact same guarded `fireConfirm` path below — never a
 * separate, more lenient activation route.
 */
export function HoldToConfirmButtonV2({
  accessibilityHint,
  disabled = false,
  label,
  onConfirm,
  reducedMotion,
}: HoldToConfirmButtonV2Props) {
  const progress = useSharedValue(0);
  const pressedScale = useSharedValue(1);
  // Synchronous guard: the hold-completion callback (fired from a reanimated
  // worklet via runOnJS) and the accessibility "activate" action can each
  // reach fireConfirm, and React's own `disabled` prop only updates a full
  // render later — a ref is what actually prevents two firings landing in
  // the same tick, before disabled has had any chance to propagate back in.
  const firedRef = useRef(false);
  const previousDisabledRef = useRef(disabled);
  // Reduce Motion removes the animated fill entirely (see the render branch
  // below) — this plain React state is the non-animated substitute
  // feedback for that case: a sighted Reduce Motion user must still see
  // something change the instant their press registers, or the control
  // looks broken/unresponsive for the whole ~600ms hold.
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (shouldClearFiredGuard(previousDisabledRef.current, disabled)) {
      firedRef.current = false;
    }
    previousDisabledRef.current = disabled;
  }, [disabled]);

  const fireConfirm = () => {
    if (!canBeginOrCompleteHold({ alreadyFired: firedRef.current, disabled })) return;
    firedRef.current = true;
    onConfirm();
  };

  const beginHold = () => {
    if (!canBeginOrCompleteHold({ alreadyFired: firedRef.current, disabled })) return;
    setHolding(true);
    pressedScale.value = withTiming(0.98, { duration: theme.motion.quick });
    progress.value = withTiming(1, { duration: HOLD_DURATION_MS }, (finished) => {
      if (finished) runOnJS(fireConfirm)();
    });
  };

  const cancelHold = () => {
    setHolding(false);
    pressedScale.value = withTiming(1, { duration: theme.motion.quick });
    if (firedRef.current) return;
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: theme.motion.quick });
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') fireConfirm();
  };

  const buttonStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));
  const fillStyle = useAnimatedStyle<ViewStyle>(() => ({
    width: `${progress.value * 100}%`,
  }));

  // Reduce Motion's non-animated substitute for the fill: an immediate,
  // static label + background change the instant a valid press-in
  // registers, gone the instant the finger lifts early — never a fake
  // stepped progress animation, and never shown once the caller has
  // disabled the control for a real, already-in-flight activation (that
  // state gets the caller's own "Activating…" label instead).
  const showReducedMotionHoldFeedback = shouldShowReducedMotionHoldFeedback({ disabled, holding, reducedMotion });
  const displayLabel = showReducedMotionHoldFeedback ? 'Keep holding…' : label;

  return (
    <AnimatedPressable
      accessibilityActions={[{ name: 'activate', label }]}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onAccessibilityAction={handleAccessibilityAction}
      onPressIn={beginHold}
      onPressOut={cancelHold}
      style={[
        styles.button,
        disabled ? styles.disabled : showReducedMotionHoldFeedback ? styles.reducedMotionHolding : styles.enabled,
        buttonStyle,
      ]}
    >
      {/* Decorative only. The real progress is exposed to assistive
          technology via accessibilityState/accessibilityHint, not this fill;
          reduced motion skips it entirely in favor of the static label/
          background swap above, since an animated width is exactly the kind
          of motion Reduce Motion asks to avoid. */}
      {!reducedMotion && <Animated.View aria-hidden style={[styles.fill, fillStyle]} />}
      <Text style={[styles.label, disabled && styles.disabledLabel]}>{displayLabel}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.controlled,
    overflow: 'hidden',
  },
  enabled: {
    backgroundColor: theme.colors.rosewood,
  },
  // The static (non-animated) Reduce Motion hold-in-progress treatment —
  // reuses the same oxblood tone the animated fill uses elsewhere, just as
  // a flat background instead of a growing width.
  reducedMotionHolding: {
    backgroundColor: theme.colors.oxblood,
  },
  disabled: {
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.colors.oxblood,
  },
  label: {
    color: theme.colors.ivory,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabledLabel: {
    color: theme.colors.warmGrey,
  },
});
