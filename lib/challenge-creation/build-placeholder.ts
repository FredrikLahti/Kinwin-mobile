// The "What will you do?" field on app/create/build.tsx previously showed
// the same hardcoded "Walk for at least 20 minutes" placeholder regardless
// of the goal the user just entered on the previous screen (e.g. choosing
// "Eat healthier" still suggested walking). `goal` is free text, not a
// fixed enum — app/create/goal.tsx's own four example chips ('Feel
// stronger', 'Sleep better', 'Eat healthier', 'Use my time better') are the
// only values with any real frequency, so this matches against those plus a
// handful of closely related keywords, and falls back to the original
// walking example (a fine, still-generic suggestion) for anything else —
// never invents a category that isn't actually implied by what the user
// wrote. Each category stays a single, concrete example, matching
// app/create/consequence.tsx's EXPERIENCE_CATEGORIES tone.

type BuildPlaceholderRule = {
  readonly keywords: readonly string[];
  readonly placeholder: string;
};

const GENERIC_PLACEHOLDER = 'Walk for at least 20 minutes';

const RULES: readonly BuildPlaceholderRule[] = [
  {
    keywords: ['strong', 'strength', 'fitness', 'fit', 'gym', 'exercise', 'workout', 'lift', 'train'],
    placeholder: 'Do a 20-minute strength workout',
  },
  {
    keywords: ['sleep', 'rest', 'bed', 'bedtime'],
    placeholder: 'Be in bed with the lights off by 11pm',
  },
  {
    keywords: ['eat', 'food', 'diet', 'healthy', 'healthier', 'nutrition', 'cook'],
    placeholder: 'Cook a vegetable-based dinner',
  },
  {
    keywords: ['time', 'productiv', 'focus', 'distract', 'phone', 'screen'],
    placeholder: 'Work with your phone in another room for 25 minutes',
  },
  {
    keywords: ['read', 'book', 'reading'],
    placeholder: 'Read for 20 minutes',
  },
];

/**
 * Picks a contextual example placeholder for build.tsx's "What will you
 * do?" field from the goal text entered upstream. Pure and keyword-based —
 * intentionally simple substring matching, not NLP, so it stays predictable
 * and testable. Case-insensitive; matches the first rule whose keyword
 * appears anywhere in the trimmed goal text.
 */
export function resolveBuildBehaviorPlaceholder(goal: string): string {
  const normalized = goal.trim().toLowerCase();
  if (!normalized) return GENERIC_PLACEHOLDER;
  const rule = RULES.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)));
  return rule?.placeholder ?? GENERIC_PLACEHOLDER;
}
