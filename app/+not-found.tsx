import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          Go to Kinwin
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F1',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
  },
  title: {
    color: '#191918',
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  link: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#191918',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
