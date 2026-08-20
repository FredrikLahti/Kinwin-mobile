import { ReactNode, useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const ENTRANCE_DURATION_MS = 360;
const ENTRANCE_TRANSLATE_Y = 10;

type EntranceTransitionV2Props = {
  children: ReactNode;
  /** Play the entrance once. Callers decide this — e.g. only the first
   * render after a real state change (a just-completed activation, a
   * freshly finalized result) — never on an ordinary revisit. */
  play: boolean;
  reducedMotion: boolean;
};

/**
 * The one restrained fade + slight settle Kinwin uses to acknowledge that a
 * real state just became true — never a default screen-mount animation, and
 * never reused for routine navigation. Renders children with no wrapper
 * overhead at all when `play` is false, so an ordinary screen pays nothing
 * for this component's existence.
 */
export function EntranceTransitionV2({ children, play, reducedMotion }: EntranceTransitionV2Props) {
  const progress = useSharedValue(play && !reducedMotion ? 0 : 1);

  useEffect(() => {
    if (!play || reducedMotion) return;
    progress.value = withTiming(1, { duration: ENTRANCE_DURATION_MS });
    // progress is a stable SharedValue ref; only play/reducedMotion should
    // ever restart this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTRANCE_TRANSLATE_Y }],
  }));

  if (!play || reducedMotion) return <>{children}</>;

  return <Animated.View style={style}>{children}</Animated.View>;
}
