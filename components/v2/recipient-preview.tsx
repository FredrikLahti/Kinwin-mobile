import { StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type RecipientPreviewV2Props = {
  categoryLabel: string;
  challengeSummary: string;
  recipientNamesText: string;
  senderName: string;
  stakeLabel: string;
};

// What the RECIPIENT will actually see, from their point of view — not
// another copy of the sender's own setup. Purely informational; no
// interactive response demo (that belongs to the real recipient page,
// not this "what am I about to send" preview).
export function RecipientPreviewV2({
  categoryLabel,
  challengeSummary,
  recipientNamesText,
  senderName,
  stakeLabel,
}: RecipientPreviewV2Props) {
  return (
    <View style={styles.page}>
      <Text style={styles.wordmark}>KINWIN</Text>
      <Text accessibilityRole="header" style={styles.headline}>
        {senderName} started a challenge.
      </Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>THEIR COMMITMENT</Text>
        <Text style={styles.rowValue}>{challengeSummary}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>IF THEY SUCCEED</Text>
        <Text style={styles.rowValue}>They pay nothing.</Text>
      </View>
      <View style={[styles.row, styles.rowHighlight]}>
        <Text style={styles.rowLabelHighlight}>IF THEY MISS IT</Text>
        <Text style={styles.rowValueHighlight}>
          {recipientNamesText} get {stakeLabel} toward a {categoryLabel.toLowerCase()} experience.
        </Text>
        <Text style={styles.rowNote}>{senderName} will not take part in it.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.ink, padding: 20, gap: 16,
  },
  wordmark: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 4 },
  headline: { color: theme.colors.ivory, fontSize: 24, fontWeight: '700', lineHeight: 30 },
  row: {
    borderRadius: theme.radius.precise, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 5,
  },
  rowLabel: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  rowValue: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  rowHighlight: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  rowLabelHighlight: { color: theme.colors.crimsonBright, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  rowValueHighlight: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  rowNote: { marginTop: 2, color: theme.colors.ivoryMuted, fontSize: 12, lineHeight: 17 },
});
