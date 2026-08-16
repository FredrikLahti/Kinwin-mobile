import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type LabeledFieldV2Props = {
  children: ReactNode;
  label: string;
};

/**
 * A label plus a bordered input row — the one shared shape behind every
 * text field on Auth, Account, and the password screens, so the same
 * small-caps label and input box never has to be restyled per screen.
 * Callers keep full control of the actual input (TextInputV2, its value,
 * validation, etc.) and just pass it as children.
 */
export function LabeledFieldV2({ children, label }: LabeledFieldV2Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  inputBox: {
    minHeight: 52, justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
});
