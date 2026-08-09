import { StatusBar } from 'expo-status-bar';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreateProgressV2 } from '@/components/v2/create-progress';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

type CreateFlowScreenV2Props = {
  backHint: string;
  children: ReactNode;
  currentStep: number;
  footer: ReactNode;
  headline: string;
  onBack: () => void;
  progressLabel?: string;
  supportingCopy?: string;
  totalSteps: number;
};

export function CreateFlowScreenV2({
  backHint,
  children,
  currentStep,
  footer,
  headline,
  onBack,
  progressLabel,
  supportingCopy,
  totalSteps,
}: CreateFlowScreenV2Props) {
  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingView}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint={backHint}
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.stepLabel}
              >
                {currentStep}/{totalSteps}
              </Text>
            </View>

            <CreateProgressV2 accessibilityLabel={progressLabel} currentStep={currentStep} totalSteps={totalSteps} />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text accessibilityRole="header" style={styles.headline}>{headline}</Text>
                {supportingCopy && <Text style={styles.supportingCopy}>{supportingCopy}</Text>}
              </View>
              {children}
            </View>
          </View>
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 6, paddingBottom: theme.spacing.small,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { flex: 1, color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  stepLabel: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '600' },
  main: { gap: 22, paddingTop: 18 },
  intro: { gap: 8 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  supportingCopy: { color: theme.colors.ivoryMuted, fontSize: 15, lineHeight: 22 },
  footer: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 10, paddingBottom: theme.spacing.small,
  },
});
