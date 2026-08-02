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
