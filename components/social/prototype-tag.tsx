import { StyleSheet, Text, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';

/**
 * A small, non-intrusive per-screen marker that this is prototype/fixture
 * content. The full explanation lives once at app/social-preview/index.tsx —
 * this must stay this quiet everywhere else (see task instructions: don't
 * repeat intrusive prototype warnings on every screen).
 */
export function PrototypeTag() {
  return (
    <View accessibilityLabel="Prototype screen. Not connected to any real data." style={styles.tag}>
      <Text style={styles.text}>PROTOTYPE · NOT SAVED</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start' },
  text: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
});
