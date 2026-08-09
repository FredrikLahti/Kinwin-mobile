import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type AvatarV2Props = {
  size?: number;
};

// A neutral, premium placeholder rather than a colored initial circle —
// Kinwin doesn't have real profile photos yet, and a per-letter color
// system would read as a generic contact-book UI kit.
export function AvatarV2({ size = 44 }: AvatarV2Props) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <Feather color={theme.colors.warmGrey} name="user" size={size * 0.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceFocused,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
  },
});
