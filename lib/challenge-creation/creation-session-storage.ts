import AsyncStorage from '@react-native-async-storage/async-storage';

import { CreationSessionStorage } from '@/lib/challenge-creation/creation-session';

// AsyncStorage already implements getItem/setItem/removeItem with this
// exact signature (including its web build, backed by localStorage) — this
// file exists only so lib/challenge-creation/creation-session.ts and its
// tests never import a React Native module directly.
export const creationSessionStorage: CreationSessionStorage = AsyncStorage;
