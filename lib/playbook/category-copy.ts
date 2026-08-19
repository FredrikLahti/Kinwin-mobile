import type { PlaybookCategory } from '@/lib/supabase/playbook-repository';

/**
 * The one canonical source for how a Playbook category is named, explained,
 * and prompted for — used by every screen that presents categories (list,
 * archive, edit) so the wording can never drift into separate, inconsistent
 * copies of the same six strings.
 */
export const PLAYBOOK_CATEGORY_LABELS: Record<PlaybookCategory, string> = {
  trigger: 'Trigger',
  obstacle: 'Obstacle',
  replacement: 'Replacement',
  environment: 'Environment',
  support: 'Support',
  lesson: 'General lesson',
};

/** One concise, operational sentence — what actually belongs in this category, not a dictionary definition. */
export const PLAYBOOK_CATEGORY_DESCRIPTIONS: Record<PlaybookCategory, string> = {
  trigger: 'Something that tends to set this off.',
  obstacle: 'Something that tends to get in the way of keeping your promise.',
  replacement: 'Something useful to do instead.',
  environment: 'A change to your surroundings that makes this easier.',
  support: 'A person or form of support that actually helps.',
  lesson: "Anything worth remembering that doesn't fit the categories above.",
};

/** The text-field placeholder — a question, not an example to copy verbatim. */
export const PLAYBOOK_CATEGORY_PROMPTS: Record<PlaybookCategory, string> = {
  trigger: 'What tends to set this off?',
  obstacle: 'What usually gets in the way?',
  replacement: 'What can you do instead?',
  environment: 'What could you change around you?',
  support: 'Who or what helps you follow through?',
  lesson: 'What do you want to remember next time?',
};
