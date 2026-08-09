import { kinwinTheme } from '@/constants/theme';

// UX v2's approved dark oxblood direction. A separate palette from
// `kinwinTheme` on purpose — v1 screens (onboarding, consequence, the
// existing challenge preview) keep their warm-copper identity untouched
// while v2 screens adopt oxblood/crimson. Spacing, radius, and motion are
// shared since those aren't part of the visual-identity change.
export const kinwinThemeV2 = {
  colors: {
    ink: '#120C0D',
    surface: '#1B1315',
    surfaceRaised: '#221718',
    surfaceFocused: '#2A1C1E',
    ivory: '#F4EBE1',
    ivoryMuted: '#B7A9A2',
    warmGrey: '#8A7A75',
    oxblood: '#5C2530',
    oxbloodDeep: '#331519',
    crimson: '#D93A46',
    crimsonBright: '#F1505C',
    crimsonSurface: '#3B1418',
    structureLine: '#2A1E20',
    structureLineStrong: '#422C2F',
  },
  radius: kinwinTheme.radius,
  spacing: kinwinTheme.spacing,
  motion: kinwinTheme.motion,
} as const;
