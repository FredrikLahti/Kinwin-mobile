import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';
import { playSelectionHaptic } from '@/lib/haptics';

export type OverflowAction = {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly destructive?: boolean;
  readonly onSelect: () => void;
};

type OverflowMenuProps = {
  accessibilityLabel: string;
  actions: readonly OverflowAction[];
};

export function OverflowMenu({ accessibilityLabel, actions }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityHint="Opens room settings, mute, report, and block options"
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          void playSelectionHaptic();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text aria-hidden style={styles.triggerIcon}>⋯</Text>
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable accessibilityLabel="Close menu" onPress={() => setOpen(false)} style={styles.backdrop}>
          <View style={styles.sheet}>
            {actions.map((action) => (
              <Pressable
                accessibilityHint={action.hint}
                accessibilityRole="button"
                key={action.key}
                onPress={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              >
                <Text style={[styles.itemText, action.destructive && styles.itemTextDestructive]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  triggerPressed: { backgroundColor: theme.colors.surface },
  triggerIcon: { color: theme.colors.bone, fontSize: 22, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11, 9, 12, 0.6)' },
  sheet: {
    borderTopWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised,
    paddingBottom: 28,
    paddingTop: 8,
  },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 22 },
  itemPressed: { backgroundColor: theme.colors.surfaceFocused },
  itemText: { color: theme.colors.bone, fontSize: 15, fontWeight: '600' },
  itemTextDestructive: { color: '#E37D6A' },
});
