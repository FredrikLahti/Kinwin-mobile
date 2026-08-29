import { Component, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { appendCrashLogEntry, buildCrashLogEntry } from '@/lib/debug/crash-log';
import { crashLogStorage } from '@/lib/debug/crash-log-storage';

type RootErrorBoundaryState = { hasError: boolean };

/**
 * No crash reporting tool (Sentry/Crashlytics/Bugsnag) is wired into this
 * app yet — this is the minimum viable substitute: a React error boundary
 * around the whole root navigator (see app/_layout.tsx) that (1) persists
 * what crashed via lib/debug/crash-log.ts, retrievable afterward from
 * Account's "Debug info" row without a live debugging session, and (2)
 * shows a plain recovery screen instead of a blank/crashed app.
 *
 * Only catches errors React's own error-boundary contract covers — a throw
 * during render, in a lifecycle method, or in a constructor below this
 * point in the tree. It cannot catch errors in event handlers, async
 * callbacks/effects, or a genuine native-layer crash (see React's own
 * documented error boundary limits) — those need their own handling if they
 * ever need this same treatment.
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    void appendCrashLogEntry(buildCrashLogEntry(error, info.componentStack), crashLogStorage);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Kinwin ran into a problem. Nothing you were doing has been changed — try again, or close and reopen the app.
          </Text>
          <Pressable
            accessibilityHint="Tries to recover from the error without closing the app"
            accessibilityRole="button"
            onPress={this.reset}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.spacing.medium, gap: 12 },
  title: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700' },
  body: { color: theme.colors.ivoryMuted, fontSize: 15, lineHeight: 21 },
  button: {
    marginTop: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.controlled, backgroundColor: theme.colors.rosewood,
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
});
