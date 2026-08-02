import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';

export default function HomeScreen() {
  const [hasPressedStart, setHasPressedStart] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.version}>Mobile V1</Text>

          <View style={styles.copy}>
            <Text style={styles.title}>Kinwin</Text>
            <Text style={styles.tagline}>When you fail, your loved ones win.</Text>
            <Text style={styles.eyebrow}>A new beginning</Text>
          </View>

          <View style={styles.action}>
            <PrimaryButton label="Start" onPress={() => setHasPressedStart(true)} />
            <Text accessibilityLiveRegion="polite" style={styles.feedback}>
              {hasPressedStart ? 'Onboarding will be added in a later step.' : ' '}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Temporary screen-specific styling; this is not Kinwin's final visual identity.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F1',
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  version: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C9C9C3',
    borderRadius: 999,
    color: '#4C4C48',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  copy: {
    gap: 16,
    paddingVertical: 40,
  },
  title: {
    color: '#191918',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  tagline: {
    maxWidth: 360,
    color: '#343432',
    fontSize: 24,
    lineHeight: 32,
  },
  eyebrow: {
    color: '#62625D',
    fontSize: 16,
    lineHeight: 24,
  },
  action: {
    gap: 8,
  },
  feedback: {
    minHeight: 20,
    color: '#62625D',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
