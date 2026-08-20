/**
 * Tracks, for the lifetime of this JS session only, which finalized
 * challenges have already had their first-presentation Result entrance and
 * outcome haptic play (see app/home/result.tsx). A plain per-session, in-
 * memory mechanism — never a database flag or AsyncStorage entry — because
 * an app restart is exactly the boundary after which "first presentation"
 * stops mattering; there is nothing worth remembering across restarts.
 */
export function createResultEntranceTracker() {
  const seen = new Set<string>();
  return {
    shouldPlay(challengeId: string): boolean {
      if (seen.has(challengeId)) return false;
      seen.add(challengeId);
      return true;
    },
  };
}

export const resultEntranceTracker = createResultEntranceTracker();
