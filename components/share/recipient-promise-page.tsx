import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { kinwinTheme as theme } from '@/constants/theme';
import { playSelectionHaptic } from '@/lib/haptics';

const COOL_NEUTRAL = '#7D8589';
const COOL_SURFACE = '#17191A';

type PreviewResponse = 'in' | 'out' | null;

type RecipientPromisePageProps = {
  categoryLabel: string;
  challengeSummary: string;
  goal: string;
  organizerIsRecipient: boolean;
  organizerName: string;
  recipientNames: string[];
  stakeLabel: string;
  successRule: string;
};

export function formatRecipientNames(names: string[]) {
  if (names.length === 0) return 'the selected recipients';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function RecipientPromisePage({
  categoryLabel,
  challengeSummary,
  goal,
  organizerIsRecipient,
  organizerName,
  recipientNames,
  stakeLabel,
  successRule,
}: RecipientPromisePageProps) {
  const [response, setResponse] = useState<PreviewResponse>(null);
  const recipients = formatRecipientNames(recipientNames);
  const organizerCopy = organizerIsRecipient
    ? `${organizerName} organizes it.`
    : `${organizerName} organizes it but is not included in the experience.`;

  const selectResponse = (nextResponse: Exclude<PreviewResponse, null>) => {
    void playSelectionHaptic();
    setResponse(nextResponse);
  };

  return (
    <View style={styles.page}>
      <View style={styles.trustHeader}>
        <Text style={styles.wordmark}>KINWIN</Text>
        <Text style={styles.trustLine}>A promise shared by someone you know.</Text>
      </View>

      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.headline}>
          You’re part of their promise.
        </Text>
        <Text style={styles.supportingCopy}>
          Someone you care about is using Kinwin to make a change—and they chose you for the
          other future.
        </Text>
      </View>

      <View style={styles.promiseSection}>
        <View aria-hidden style={styles.promiseThread} />
        <View aria-hidden style={styles.promiseAnchor} />
        <Text style={styles.sectionLabel}>THEIR PROMISE</Text>
        <Text style={styles.goalLead}>They’re working toward:</Text>
        <Text style={styles.goalText}>{goal}</Text>
        <View style={styles.promiseSummary}>
          <Text style={styles.promiseText}>{challengeSummary}</Text>
          <View style={styles.ruleDivider} />
          <Text style={styles.ruleLabel}>SUCCESS MEANS</Text>
          <Text style={styles.ruleText}>{successRule}</Text>
        </View>
      </View>

      <View
        accessibilityLabel="Two futures: nothing is charged if they keep the promise; the recipients receive one shared experience if they do not"
        style={styles.futuresSection}
      >
        <Text style={styles.sectionLabel}>THE TWO FUTURES</Text>
        <View aria-hidden style={styles.forkGraphic}>
          <View style={styles.incomingThread} />
          <View style={styles.forkBar} />
          <View style={styles.leftDrop} />
          <View style={styles.rightDrop} />
          <View style={styles.forkNode} />
        </View>
        <View style={styles.futureRow}>
          <View style={[styles.futureSurface, styles.keepSurface]}>
            <Text style={styles.keepLabel}>IF THEY KEEP IT</Text>
            <Text style={styles.futureTitle}>The change stays with them.</Text>
            <Text style={styles.futureCopy}>
              Nothing is charged. The change stays with them.
            </Text>
          </View>
          <View style={[styles.futureSurface, styles.rewardSurface]}>
            <Text style={styles.rewardLabel}>IF THEY DON’T</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.rewardAmount}>
              {stakeLabel}
            </Text>
            <Text style={styles.rewardCopy}>
              One shared {categoryLabel} experience for {recipients}.
            </Text>
            <Text style={styles.rewardOrganizer}>{organizerCopy}</Text>
            <Text style={styles.rewardSitOut}>
              The person who made the promise will not take part.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.groupSection}>
        <Text style={styles.sectionLabel}>WHO THE EXPERIENCE IS FOR</Text>
        <Text style={styles.groupNames}>{recipients}</Text>
        <Text style={styles.poolCopy}>
          One shared reward pool—not a separate amount for each person.
        </Text>
      </View>

      <View style={styles.paymentTrustSection}>
        <Text accessibilityRole="header" style={styles.trustHeading}>
          No payment. No card details.
        </Text>
        <Text style={styles.trustBody}>
          Kinwin never asks recipients to pay. The sender shares this link directly, and you can
          decline without owing anything.
        </Text>
        <Text style={styles.trustQuietLine}>
          The reward exists only if the challenge fails.
        </Text>
      </View>

      <View style={styles.responseSection}>
        <Text style={styles.sectionLabel}>RECIPIENT RESPONSE · PREVIEW</Text>
        <Text style={styles.responseIntro}>
          The future page will let each recipient respond in their own way.
        </Text>
        <View style={styles.responseActions}>
          <Pressable
            accessibilityHint="Previews the response shown when a recipient joins"
            accessibilityLabel="I’m in"
            accessibilityRole="button"
            accessibilityState={{ selected: response === 'in' }}
            onPress={() => selectResponse('in')}
            style={({ pressed }) => [
              styles.responseButton,
              styles.primaryResponse,
              response === 'in' && styles.primaryResponseSelected,
              pressed && styles.responsePressed,
            ]}
          >
            <Text style={styles.primaryResponseText}>I’m in</Text>
            <Text aria-hidden style={styles.responseArrow}>→</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Previews the response shown when a recipient declines"
            accessibilityLabel="Not for me"
            accessibilityRole="button"
            accessibilityState={{ selected: response === 'out' }}
            onPress={() => selectResponse('out')}
            style={({ pressed }) => [
              styles.responseButton,
              styles.secondaryResponse,
              response === 'out' && styles.secondaryResponseSelected,
              pressed && styles.responsePressed,
            ]}
          >
            <Text style={styles.secondaryResponseText}>Not for me</Text>
          </Pressable>
        </View>
        {response && (
          <View accessibilityLiveRegion="polite" style={styles.responseConfirmation}>
            <View aria-hidden style={styles.responseNode} />
            <Text style={styles.responseConfirmationText}>
              {response === 'in'
                ? 'You’re in. You can support them without watching every check-in.'
                : 'No problem. They’ll be asked to choose someone else.'}
            </Text>
          </View>
        )}
        <Text style={styles.previewOnlyLine}>
          Your response would not be sent in preview mode.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.deepInk,
  },
  trustHeader: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.structureLine,
    backgroundColor: theme.colors.ink,
  },
  wordmark: {
    color: theme.colors.bone,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4.5,
  },
  trustLine: { color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15 },
  intro: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 28 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 34,
    fontWeight: '400',
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  supportingCopy: {
    marginTop: 12,
    color: theme.colors.boneMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionLabel: {
    color: theme.colors.copper,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.35,
  },
  promiseSection: {
    position: 'relative',
    marginHorizontal: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: theme.colors.copperBright,
    borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  promiseThread: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.68,
  },
  promiseAnchor: {
    position: 'absolute',
    top: 42,
    right: -5,
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: theme.colors.copperBright,
    borderRadius: 5,
    backgroundColor: theme.colors.copperDeep,
  },
  goalLead: { marginTop: 18, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  goalText: {
    marginTop: 5,
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 23,
    lineHeight: 29,
  },
  promiseSummary: {
    marginTop: 19,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.copper,
    paddingLeft: 13,
  },
  promiseText: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  ruleDivider: { height: 1, marginVertical: 13, backgroundColor: theme.colors.structureLine },
  ruleLabel: { color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.15 },
  ruleText: { marginTop: 5, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  futuresSection: { paddingHorizontal: 14, paddingTop: 31 },
  forkGraphic: { position: 'relative', height: 52, marginTop: 13 },
  incomingThread: {
    position: 'absolute', top: 0, left: '50%', width: 1, height: 23,
    backgroundColor: theme.colors.copper,
  },
  forkBar: {
    position: 'absolute', top: 22, right: '25%', left: '25%', height: 1,
    backgroundColor: theme.colors.copper,
  },
  leftDrop: {
    position: 'absolute', top: 22, left: '25%', width: 1, height: 30,
    backgroundColor: COOL_NEUTRAL, opacity: 0.78,
  },
  rightDrop: {
    position: 'absolute', top: 22, left: '75%', width: 1, height: 30,
    backgroundColor: theme.colors.copper,
  },
  forkNode: {
    position: 'absolute', top: 17, left: '50%', width: 11, height: 11,
    marginLeft: -5, borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 6, backgroundColor: theme.colors.copperDeep,
  },
  futureRow: { flexDirection: 'row', gap: 9 },
  futureSurface: {
    flex: 1,
    minHeight: 166,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 16,
  },
  keepSurface: { borderColor: '#2B3032', backgroundColor: COOL_SURFACE },
  rewardSurface: { borderColor: theme.colors.copper, backgroundColor: theme.colors.copperDeep },
  keepLabel: { color: COOL_NEUTRAL, fontSize: 8, fontWeight: '800', letterSpacing: 1.05 },
  rewardLabel: { color: theme.colors.copperBright, fontSize: 8, fontWeight: '800', letterSpacing: 1.05 },
  futureTitle: { marginTop: 11, color: theme.colors.bone, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  futureCopy: { marginTop: 8, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  rewardAmount: {
    marginTop: 12,
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 38,
    fontWeight: '400',
    letterSpacing: -0.8,
    lineHeight: 43,
  },
  rewardCopy: { marginTop: 7, color: theme.colors.bone, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  rewardOrganizer: {
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.structureLineStrong,
    paddingTop: 10,
    color: theme.colors.boneMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  rewardSitOut: { marginTop: 7, color: theme.colors.copperBright, fontSize: 10, lineHeight: 15 },
  groupSection: {
    marginHorizontal: 14,
    marginTop: 28,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  groupNames: { marginTop: 10, color: theme.colors.bone, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  poolCopy: { marginTop: 5, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15 },
  paymentTrustSection: {
    marginHorizontal: 14,
    marginTop: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: theme.colors.structureLineStrong,
    borderBottomColor: theme.colors.structureLine,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  trustHeading: {
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 18,
    lineHeight: 23,
  },
  trustBody: { marginTop: 7, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  trustQuietLine: { marginTop: 7, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15 },
  responseSection: { paddingHorizontal: 14, paddingTop: 27, paddingBottom: 28 },
  responseIntro: { marginTop: 7, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  responseActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  responseButton: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.precise,
    paddingHorizontal: 14,
  },
  primaryResponse: { flexDirection: 'row', gap: 10, borderColor: theme.colors.copper, backgroundColor: theme.colors.copperSurface },
  primaryResponseSelected: { borderColor: theme.colors.copperBright, backgroundColor: '#462A17' },
  secondaryResponse: { borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface },
  secondaryResponseSelected: { borderColor: COOL_NEUTRAL, backgroundColor: COOL_SURFACE },
  responsePressed: { opacity: 0.82 },
  primaryResponseText: { color: theme.colors.bone, fontSize: 14, fontWeight: '700' },
  secondaryResponseText: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '700' },
  responseArrow: { color: theme.colors.copperBright, fontSize: 17 },
  responseConfirmation: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.structureLineStrong,
    paddingTop: 12,
  },
  responseNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  responseConfirmationText: { flex: 1, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  previewOnlyLine: { marginTop: 10, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15 },
});
