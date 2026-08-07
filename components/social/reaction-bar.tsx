import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';
import { ReactionCounts, ReactionKind } from '@/domain/social/types';
import { REACTION_OPTIONS } from '@/lib/social/reactions';
import { playSelectionHaptic } from '@/lib/haptics';

type ReactionBarProps = {
  initialReactions: ReactionCounts;
  /** Accessible label prefix, e.g. "React to Alex's update". */
  contextLabel: string;
};

export function ReactionBar({ contextLabel, initialReactions }: ReactionBarProps) {
  const [reactions, setReactions] = useState<ReactionCounts>(initialReactions);
  const [mine, setMine] = useState<ReactionKind | null>(null);

  const toggle = (kind: ReactionKind) => {
    void playSelectionHaptic();
    setReactions((current) => {
      const next = { ...current };
      if (mine === kind) {
        next[kind] = Math.max(0, (next[kind] ?? 1) - 1);
        return next;
      }
      if (mine) next[mine] = Math.max(0, (next[mine] ?? 1) - 1);
      next[kind] = (next[kind] ?? 0) + 1;
      return next;
    });
    setMine((current) => (current === kind ? null : kind));
  };

  const active = REACTION_OPTIONS.filter((option) => (reactions[option.kind] ?? 0) > 0 || mine === option.kind);

  return (
    <View style={styles.row}>
      {active.map((option) => {
        const isMine = mine === option.kind;
        const count = reactions[option.kind] ?? 0;
        return (
          <Pressable
            accessibilityHint={isMine ? `Removes your ${option.label} reaction` : `Adds a ${option.label} reaction`}
            accessibilityLabel={`${contextLabel}: ${option.label}, ${count}`}
            accessibilityRole="button"
            hitSlop={4}
            key={option.kind}
            onPress={() => toggle(option.kind)}
            style={({ pressed }) => [styles.chip, isMine && styles.chipActive, pressed && styles.chipPressed]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
            {count > 0 && <Text style={[styles.count, isMine && styles.countActive]}>{count}</Text>}
          </Pressable>
        );
      })}
      <ReactionPicker contextLabel={contextLabel} excluding={active.map((option) => option.kind)} onPick={toggle} />
    </View>
  );
}

function ReactionPicker({
  contextLabel,
  excluding,
  onPick,
}: {
  contextLabel: string;
  excluding: readonly ReactionKind[];
  onPick: (kind: ReactionKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const remaining = REACTION_OPTIONS.filter((option) => !excluding.includes(option.kind));

  if (!open) {
    return (
      <Pressable
        accessibilityHint={`Opens more reaction choices for ${contextLabel}`}
        accessibilityLabel="Add reaction"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, styles.addChip, pressed && styles.chipPressed]}
      >
        <Text style={styles.addIcon}>+</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.pickerRow}>
      {remaining.map((option) => (
        <Pressable
          accessibilityHint={`Reacts with ${option.label}`}
          accessibilityLabel={option.label}
          accessibilityRole="button"
          hitSlop={4}
          key={option.kind}
          onPress={() => {
            onPick(option.kind);
            setOpen(false);
          }}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.emoji}>{option.emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface },
  chipPressed: { opacity: 0.7 },
  addChip: { paddingHorizontal: 9 },
  addIcon: { color: theme.colors.boneMuted, fontSize: 15, fontWeight: '700' },
  emoji: { fontSize: 14 },
  count: { color: theme.colors.boneMuted, fontSize: 11, fontWeight: '700' },
  countActive: { color: theme.colors.copperBright },
});
