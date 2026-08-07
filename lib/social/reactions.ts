import { ReactionKind } from '@/domain/social/types';

/**
 * Reaction vocabulary meant to read like real friends and family, not a
 * uniformly therapeutic support-group tone (docs/SOCIAL_V1_SPEC.md section 1).
 */
export const REACTION_OPTIONS: readonly { readonly kind: ReactionKind; readonly emoji: string; readonly label: string }[] = [
  { kind: 'fire', emoji: '🔥', label: 'Fire' },
  { kind: 'strength', emoji: '💪', label: 'You got this' },
  { kind: 'laugh', emoji: '😂', label: 'Lol' },
  { kind: 'wince', emoji: '😬', label: 'Oof' },
  { kind: 'crown', emoji: '👑', label: 'Icon' },
  { kind: 'salute', emoji: '🫡', label: 'Respect' },
];
