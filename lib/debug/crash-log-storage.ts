import AsyncStorage from '@react-native-async-storage/async-storage';

import { CrashLogStorage } from '@/lib/debug/crash-log';

// AsyncStorage already implements getItem/setItem/removeItem with this
// exact signature (including its web build, backed by localStorage) — same
// pattern as lib/challenge-creation/creation-session-storage.ts, so
// lib/debug/crash-log.ts and its tests never import a React Native module
// directly.
export const crashLogStorage: CrashLogStorage = AsyncStorage;
