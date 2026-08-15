import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type ResumeCreationSheetV2Props = {
  confirmingDiscard: boolean;
  discardFailed: boolean;
  discardingSession: boolean;
  onCancelDiscard: () => void;
  onClose: () => void;
  onConfirmDiscard: () => void;
  onContinue: () => void;
  onRequestDiscard: () => void;
  reducedMotion: boolean;
  resumableSummary: string;
  visible: boolean;
};

/**
 * The "Challenge in progress" / "Discard this challenge?" sheet pair for
 * hooks/use-create-challenge-entry.ts. Presentational only — every action
 * and every piece of state is owned by that shared hook, so Home and
 * Account render the exact same behavior instead of two independently
 * drifting draft-lifecycle implementations.
 */
export function ResumeCreationSheetV2({
  confirmingDiscard,
  discardFailed,
  discardingSession,
  onCancelDiscard,
  onClose,
  onConfirmDiscard,
  onContinue,
  onRequestDiscard,
  reducedMotion,
  resumableSummary,
  visible,
}: ResumeCreationSheetV2Props) {
  return (
    <BottomSheetV2 onClose={onClose} reducedMotion={reducedMotion} visible={visible}>
      {confirmingDiscard ? (
        <>
          <Text accessibilityRole="header" style={styles.sheetTitle}>Discard this challenge?</Text>
          <Text style={styles.sheetBody}>This permanently deletes everything entered so far. This can’t be undone.</Text>
          {discardFailed && (
            <Text style={styles.sheetError}>Kinwin couldn’t discard this challenge. Try again.</Text>
          )}
          <View style={styles.sheetActions}>
            <Pressable
              accessibilityHint="Keeps your unfinished challenge and closes this sheet"
              accessibilityRole="button"
              onPress={onCancelDiscard}
              style={({ pressed }) => [styles.keepButton, pressed && styles.keepButtonPressed]}
            >
              <Text style={styles.keepButtonLabel}>Keep it</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Permanently discards your unfinished challenge and starts a new one"
              accessibilityRole="button"
              disabled={discardingSession}
              onPress={onConfirmDiscard}
              style={({ pressed }) => [styles.destructiveButton, pressed && styles.destructiveButtonPressed]}
            >
              <Text style={styles.destructiveButtonLabel}>{discardingSession ? 'Discarding…' : discardFailed ? 'Retry' : 'Discard and start new'}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.sheetTitle}>Challenge in progress</Text>
          <Text style={styles.sheetBody}>
            {resumableSummary ? `You have an unfinished challenge: ${resumableSummary}.` : 'You have an unfinished challenge.'}
          </Text>
          <View style={styles.sheetActions}>
            <Pressable
              accessibilityHint="Restores your unfinished challenge where you left off"
              accessibilityRole="button"
              onPress={onContinue}
              style={({ pressed }) => [styles.keepButton, pressed && styles.keepButtonPressed]}
            >
              <Text style={styles.keepButtonLabel}>Continue challenge</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Opens a confirmation to discard this and start a brand new challenge"
              accessibilityRole="button"
              onPress={onRequestDiscard}
              style={({ pressed }) => [styles.destructiveButton, pressed && styles.destructiveButtonPressed]}
            >
              <Text style={styles.destructiveButtonLabel}>Start a new challenge</Text>
            </Pressable>
          </View>
        </>
      )}
    </BottomSheetV2>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  sheetBody: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  sheetError: { marginTop: 8, color: '#E37D6A', fontSize: 13, lineHeight: 18 },
  sheetActions: { marginTop: 20, gap: 10 },
  keepButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  keepButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  keepButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  destructiveButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: '#4A1B1B',
  },
  destructiveButtonPressed: { backgroundColor: '#5C2222' },
  destructiveButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
});
