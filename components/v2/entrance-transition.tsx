import { ReactNode, useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const ENTRANCE_DURATION_MS = 360;
const ENTRANCE_TRANSLATE_Y = 10;

type EntranceTransitionV2Props = {
  children: ReactNode;
  /**
   * Play the entrance once. Contract: this MUST already reflect the
   * correct value on this component's very first render — e.g. resolved
   * via a lazy `useState(() => ...)` initializer keyed on the same
   * identity that decides "first presentation," never set later from an
   * effect. This component deliberately does NOT support a later
   * false -> true transition: once a first render has shown children under
   * `play=false` (fully visible, unanimated — see the render branch
   * below), the entrance decision is frozen for the rest of this mount.
   * Retroactively hiding and re-revealing already-visible content would be
   * a worse visual flash than skipping the animation entirely, so a late
   * flip to `true` is intentionally ignored rather than "fixed up."
   * `reducedMotion`, unlike `play`, stays fully live across the mount.
   */
  play: boolean;
  reducedMotion: boolean;
};

/**
 * The one restrained fade + slight settle Kinwin uses to acknowledge that a
 * real state just became true — never a default screen-mount animation, and
 * never reused for routine navigation. Renders children with no wrapper
 * overhead at all when `play` was false at mount, so an ordinary screen
 * pays nothing for this component's existence.
 */
export function EntranceTransitionV2({ children, play, reducedMotion }: EntranceTransitionV2Props) {
  // Captured once, at mount — see the `play` prop's own doc comment above
  // for why a later change is deliberately never re-read.
  const playOnMountRef = useRef(play);
  const shouldAnimate = playOnMountRef.current && !reducedMotion;
  const progress = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    if (!shouldAnimate) return;
    progress.value = withTiming(1, { duration: ENTRANCE_DURATION_MS });
    // progress is a stable SharedValue ref; only shouldAnimate flipping on
    // (reducedMotion turning off after a play=true mount) should ever
    // restart this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTRANCE_TRANSLATE_Y }],
  }));

  if (!playOnMountRef.current || reducedMotion) return <>{children}</>;

  return <Animated.View style={style}>{children}</Animated.View>;
}
