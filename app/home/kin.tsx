import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

export default function KinV2() {
  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Text style={styles.wordmark}>KINWIN</Text>
        <View style={styles.body}>
          <Text style={styles.title}>Kin is on the way.</Text>
          <Text style={styles.copy}>You&apos;ll see your people and their progress here.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.medium,
  },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xsmall },
  title: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  copy: { color: theme.colors.ivoryMuted, fontSize: 14, textAlign: 'center' },
});
