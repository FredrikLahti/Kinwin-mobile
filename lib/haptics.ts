import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

async function playSafely(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    // Haptics are supportive feedback and must never block the interaction.
  }
}

export function playSelectionHaptic(): Promise<void> {
  return playSafely(() =>
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      : Haptics.selectionAsync(),
  );
}

export function playImportantHaptic(): Promise<void> {
  return playSafely(() =>
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}

export function playCommitmentHaptic(): Promise<void> {
  return playSafely(() =>
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  );
}

// A finalized challenge's first-presentation-only outcome haptics (see
// resolveChallengeResultHapticOutcome and resolveCheckInHapticOutcome in
// lib/haptics-outcome.ts for exactly when each is used). Deliberately two
// new functions, not more: SUCCESS and CONSEQUENCE are the only outcome
// feelings this product distinguishes — a lapse and a completed failure are
// real product outcomes, not system failures, so neither ever uses
// NotificationFeedbackType.Error.
export function playSuccessHaptic(): Promise<void> {
  return playSafely(() =>
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export function playConsequenceHaptic(): Promise<void> {
  return playSafely(() =>
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  );
}
