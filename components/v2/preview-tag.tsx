import { StyleSheet, Text, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

// Mirrors components/social/prototype-tag.tsx's quiet, single-line pattern,
// re-themed for UX v2. Marks screens/sections whose content is
// representative demo data, never persisted state.
export function PreviewTagV2({ label = 'PREVIEW · NOT SAVED' }: { label?: string }) {
  return (
    <View accessibilityLabel="Preview screen. Not connected to any real data." style={styles.tag}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start' },
  text: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
});
