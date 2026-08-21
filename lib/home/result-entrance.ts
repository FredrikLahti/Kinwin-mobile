/**
 * Tracks which finalized challenges have already had their first-
 * presentation Result entrance and outcome haptic play. Backed by a plain
 * in-memory Set, held in a module-level singleton (`resultEntranceTracker`
 * below) — never a database flag or AsyncStorage entry.
 *
 * Deliberately split into a pure read (`hasSeen`) and a separate mutation
 * (`markSeen`) rather than one combined "check and mark" call: a React
 * state initializer (`useState(() => ...)`) must stay pure — React may
 * invoke it more than once (Strict Mode's double-invoke check in
 * development, or a render that is started and then abandoned/discarded
 * without ever committing) — so the render-time decision may only ever
 * READ this tracker. Marking a challenge as seen must happen only after a
 * render has actually committed (see app/home/result.tsx's own effect),
 * which is also the only point at which "this was genuinely shown" is
 * actually true.
 *
 * Session-scoped by design: `hasSeen(id)` reflects only what `markSeen`
 * has recorded since this JS process started. A real app restart (the app
 * fully terminated and relaunched, not just backgrounded/foregrounded —
 * React Native does not tear down the JS runtime on a simple background/
 * foreground cycle) creates a brand new module instance with an empty Set,
 * so the very next Result view of that same challenge would be treated as
 * unseen again. That is an accepted, intentional trade-off, not a bug:
 * "first presentation" is a courtesy for the session in which a challenge
 * actually just finished, not a permanent fact worth persisting.
 */
export function createResultEntranceTracker() {
  const seen = new Set<string>();
  return {
    hasSeen(challengeId: string): boolean {
      return seen.has(challengeId);
    },
    // Idempotent — safe to call more than once for the same id (e.g. a
    // React development effect replay), on purpose.
    markSeen(challengeId: string): void {
      seen.add(challengeId);
    },
  };
}

export const resultEntranceTracker = createResultEntranceTracker();
