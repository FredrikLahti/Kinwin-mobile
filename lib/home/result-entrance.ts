/**
 * Tracks which finalized challenges have already had their first-
 * presentation Result entrance and outcome haptic play. Backed by a plain
 * in-memory Set, held in a module-level singleton (`resultEntranceTracker`
 * below) — never a database flag or AsyncStorage entry.
 *
 * Concretely: `shouldPlay(id)` returns true the first time it is ever
 * called for a given challenge id, and false on every call after that, for
 * as long as this JS process keeps running. A real app restart (the app
 * fully terminated and relaunched, not just backgrounded/foregrounded —
 * React Native does not tear down the JS runtime on a simple background/
 * foreground cycle) creates a brand new module instance with an empty Set,
 * so the very next Result view of that same challenge would play the
 * entrance again. That is an accepted, intentional trade-off, not a bug:
 * "first presentation" is a courtesy for the session in which a challenge
 * actually just finished, not a permanent fact worth persisting.
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
