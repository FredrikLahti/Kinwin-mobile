import { kinwinTheme } from '@/constants/theme';

// UX v2's approved dark oxblood direction. A separate palette from
// `kinwinTheme` on purpose — v1 screens (onboarding, consequence, the
// existing challenge preview) keep their warm-copper identity untouched
// while v2 screens adopt oxblood/crimson. Spacing, radius, and motion are
// shared since those aren't part of the visual-identity change.
//
// Color semantics (locked): primary actions (Continue, Confirm commitment,
// Add payment method, Activate challenge, Create challenge) fill with
// `brass` and dark (`ink`) text — muted antique-gold, never bright/shiny
// gold, orange, copper, white/ivory, or crimson; must never look
// destructive. Selected/focused states use `oxblood`/`oxbloodDeep`.
// Secondary actions stay dark surfaces with restrained borders/text.
// `crimson`/`crimsonBright` are reserved for destructive actions (cancel,
// delete) and small restrained accents (links, icons) — never a filled
// primary button. `sage` is for restrained success/completed indicators
// where semantically useful. `ivory` stays for typography/content, not
// large primary-button fills.
export const kinwinThemeV2 = {
  colors: {
    ink: '#120C0D',
    surface: '#1B1315',
    surfaceRaised: '#221718',
    surfaceFocused: '#2A1C1E',
    ivory: '#F4EBE1',
    ivoryMuted: '#B7A9A2',
    warmGrey: '#8A7A75',
    brass: '#B79A63',
    oxblood: '#5C2530',
    oxbloodDeep: '#331519',
    crimson: '#D93A46',
    crimsonBright: '#F1505C',
    crimsonSurface: '#3B1418',
    sage: '#7A9B76',
    structureLine: '#2A1E20',
    structureLineStrong: '#422C2F',
  },
  radius: kinwinTheme.radius,
  spacing: kinwinTheme.spacing,
  motion: kinwinTheme.motion,
} as const;
