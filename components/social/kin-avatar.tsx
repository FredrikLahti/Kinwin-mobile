import { StyleSheet, Text, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';

type KinAvatarProps = {
  initials: string;
  size?: number;
};

export function KinAvatar({ initials, size = 40 }: KinAvatarProps) {
  return (
    <View
      aria-hidden
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.copperSurface,
  },
  initials: {
    color: theme.colors.copperBright,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
