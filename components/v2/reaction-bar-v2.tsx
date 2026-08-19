import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { playSelectionHaptic } from '@/lib/haptics';
import { REACTION_KINDS, ReactionKind } from '@/lib/supabase/kin-repository';

// Accessibility-only naming for each emoji — never rendered as visible
// button text. A permanently-visible row of five LABELED buttons (Respect/
// Nice/Worth it/Ouch/Brutal) was exactly the founder's complaint: it read
// as Kinwin prescribing how a friend is allowed to respond. Standard emoji
// plus progressive disclosure (only reactions that have been used are
// shown; a compact "+" reveals the rest) is meant to feel like an ordinary
// messaging-app reaction, not a voting panel.
const REACTION_ACCESSIBILITY_NAMES: Record<ReactionKind, string> = {
  '🔥': 'Fire', '❤️': 'Heart', '😂': 'Laughing', '😬': 'Wince', '👑': 'Crown',
};

type ReactionBarV2Props = {
  readonly reactionCounts: Readonly<Record<string, number>>;
  readonly myReaction: string | null;
  readonly onToggle: (kind: ReactionKind) => void;
  readonly disabled?: boolean;
  /** Accessible label prefix, e.g. "React to Alex's update". */
  readonly contextLabel: string;
};

/**
 * Real, persisted reaction control — active reactions plus a compact "+" to
 * add a different one, never all five permanently visible. One reaction per
 * user per activity: tapping an existing reaction of yours removes it;
 * tapping a different one replaces it (mirrors setMyReaction/clearMyReaction
 * in lib/supabase/kin-repository.ts, which this component's caller wires
 * onToggle to). The interaction shape itself is adapted from the earlier
 * unwired prototype (components/social/reaction-bar.tsx) — that component's
 * own reaction vocabulary and local-only state were fixture-specific and
 * are not reused here.
 */
export function ReactionBarV2({ contextLabel, disabled, myReaction, onToggle, reactionCounts }: ReactionBarV2Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const active = REACTION_KINDS.filter((kind) => (reactionCounts[kind] ?? 0) > 0 || myReaction === kind);
  const remaining = REACTION_KINDS.filter((kind) => !active.includes(kind));

  const press = (kind: ReactionKind) => {
    void playSelectionHaptic();
    setPickerOpen(false);
    onToggle(kind);
  };

  return (
    <View style={styles.row}>
      {active.map((kind) => {
        const isMine = myReaction === kind;
        const count = reactionCounts[kind] ?? 0;
        return (
          <Pressable
            accessibilityHint={isMine ? `Removes your ${REACTION_ACCESSIBILITY_NAMES[kind]} reaction` : `Reacts with ${REACTION_ACCESSIBILITY_NAMES[kind]}`}
            accessibilityLabel={`${contextLabel}: ${REACTION_ACCESSIBILITY_NAMES[kind]}${count > 0 ? `, ${count}` : ''}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isMine }}
            disabled={disabled}
            key={kind}
            onPress={() => press(kind)}
            style={({ pressed }) => [styles.chip, isMine && styles.chipActive, pressed && styles.chipPressed]}
          >
            <Text style={styles.emoji}>{kind}</Text>
            {count > 0 && <Text style={[styles.count, isMine && styles.countActive]}>{count}</Text>}
          </Pressable>
        );
      })}
      {!pickerOpen
        ? remaining.length > 0 && (
            <Pressable
              accessibilityHint={`Opens more reaction choices for ${contextLabel}`}
              accessibilityLabel="Add reaction"
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => { void playSelectionHaptic(); setPickerOpen(true); }}
              style={({ pressed }) => [styles.chip, styles.addChip, pressed && styles.chipPressed]}
            >
              <Text style={styles.addIcon}>+</Text>
            </Pressable>
          )
        : remaining.map((kind) => (
            <Pressable
              accessibilityHint={`Reacts with ${REACTION_ACCESSIBILITY_NAMES[kind]}`}
              accessibilityLabel={REACTION_ACCESSIBILITY_NAMES[kind]}
              accessibilityRole="button"
              disabled={disabled}
              key={kind}
              onPress={() => press(kind)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.emoji}>{kind}</Text>
            </Pressable>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', minHeight: 30, gap: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.colors.surfaceRaised,
  },
  chipActive: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  chipPressed: { opacity: 0.75 },
  addChip: { paddingHorizontal: 9 },
  addIcon: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '700' },
  emoji: { fontSize: 15 },
  count: { color: theme.colors.ivoryMuted, fontSize: 11, fontWeight: '700' },
  countActive: { color: theme.colors.crimsonBright },
});
