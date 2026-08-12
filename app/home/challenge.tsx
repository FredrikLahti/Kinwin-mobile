import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useRealActiveChallenge } from '@/hooks/use-real-active-challenge';
import { formatClockTime } from '@/lib/challenge-ux-preview/view-model';
import { describeChallengeIdentity, describeConsequence, describeDurationPosition, describeProgress } from '@/lib/home/challenge-summary';
import { playSelectionHaptic } from '@/lib/haptics';
import { buildRecipientInvitationUrl } from '@/lib/recipient-invitations/url';
import { buildInvitationShareContent } from '@/lib/recipient-invitations/share';
import { createOrganizerInvitation, createRecipientInvitation, fetchOwnerInvitations, fetchOwnerRewardOrganizer, markRecipientInvitationShared, OwnerInvitation, OwnerRewardOrganizer } from '@/lib/supabase/recipient-invitation-repository';

const STATUS_COPY = { ready: 'Ready to share', sent: 'Awaiting response', accepted: 'Accepted', declined: 'Declined' } as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ActiveChallengeDetailScreen() {
  const router = useRouter();
  const { state: real } = useRealActiveChallenge();
  const [invitations, setInvitations] = useState<readonly OwnerInvitation[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [organizer,setOrganizer]=useState<OwnerRewardOrganizer|null>(null);
  const [sharingIds, setSharingIds] = useState<ReadonlySet<string>>(new Set());
  const challengeId = real.status === 'ready' ? real.data.challenge.id : '';
  const loadInvitations = useCallback(async () => { if (!challengeId) return; const [result,organizerResult] = await Promise.all([fetchOwnerInvitations(challengeId),fetchOwnerRewardOrganizer(challengeId)]); if (result.ok) setInvitations(result.value); else setInviteError(result.message);if(organizerResult.ok)setOrganizer(organizerResult.value);else setInviteError(organizerResult.message); }, [challengeId]);
  useFocusEffect(useCallback(() => { void loadInvitations(); }, [loadInvitations]));

  const goBack = () => {
    void playSelectionHaptic();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  if (real.status !== 'ready') {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Pressable accessibilityHint="Returns to Home" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyText}>{real.status === 'error' ? 'Could not load this challenge.' : 'No active challenge to show.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { challenge, periods } = real.data;
  const identity = describeChallengeIdentity(challenge);
  const consequence = describeConsequence(challenge);
  const focusPeriod = periods.find((period) => period.id === real.view.focusPeriodId) ?? null;
  const durationPosition = describeDurationPosition(focusPeriod, real.view.progress.periodsTotal);
  const progressLine = describeProgress(challenge, real.view.currentPeriodStatus, real.view.progress, focusPeriod);

  const withSharing = async (id: string, run: () => Promise<void>) => {
    if (sharingIds.has(id)) return;
    setSharingIds((current) => new Set(current).add(id));
    try { await run(); }
    finally { setSharingIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  };

  const shareInvite = (recipientId: string, recipientName: string) => withSharing(recipientId, async () => {
    void playSelectionHaptic();
    setInviteError(null);
    const prepared = await createRecipientInvitation(recipientId);
    if (!prepared.ok) { setInviteError(prepared.message); return; }
    const url = buildRecipientInvitationUrl(process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL, prepared.value.token);
    if (!url) { setInviteError('A public invitation URL has not been configured yet.'); return; }
    const result = await Share.share(buildInvitationShareContent(`Hi ${recipientName}, I made a Kinwin challenge and chose you as a recipient. Open your private invitation:`, url));
    if (result.action === Share.sharedAction) await markRecipientInvitationShared(prepared.value.invitationId);
    await loadInvitations();
  });
  const shareOrganizerInvite = () => withSharing('organizer', async () => {
    if (!organizer || organizer.kind !== 'other') return;
    void playSelectionHaptic();
    setInviteError(null);
    const prepared = await createOrganizerInvitation(organizer.id);
    if (!prepared.ok) { setInviteError(prepared.message); return; }
    const url = buildRecipientInvitationUrl(process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL, prepared.value.token);
    if (!url) { setInviteError('A public invitation URL has not been configured yet.'); return; }
    const result = await Share.share(buildInvitationShareContent(`Hi ${organizer.displayName}, I chose you to organize the reward for my Kinwin challenge. Open your private invitation:`, url));
    if (result.action === Share.sharedAction) await markRecipientInvitationShared(prepared.value.invitationId);
    await loadInvitations();
  });

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable accessibilityHint="Returns to Home" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Text aria-hidden style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.wordmark}>KINWIN</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>GOAL</Text>
          <Text style={styles.goal}>{challenge.goal}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THE CHALLENGE</Text>
          <Text style={styles.identityHeadline}>{identity.headline}</Text>
          {identity.ruleDetail && <Text style={styles.identityRule}>{identity.ruleDetail}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DURATION</Text>
          <Text style={styles.body}>{durationPosition ?? `${challenge.duration.value} weeks`}</Text>
          <Text style={styles.bodyMuted}>{formatDate(challenge.startsAt)} to {formatDate(challenge.plannedEndsAt)}</Text>
          {real.view.finalResult === null && Boolean(real.view.timeRemaining) && (
            <Text style={styles.bodyMuted}>{real.view.timeRemaining}</Text>
          )}
        </View>

        {progressLine && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PROGRESS</Text>
            <Text style={styles.body}>{progressLine}</Text>
            {real.view.progress.streakLabel && <Text style={styles.bodyMuted}>{real.view.progress.streakLabel}</Text>}
          </View>
        )}

        {focusPeriod && real.view.finalResult === null && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>REPORTING</Text>
            <Text style={styles.bodyMuted}>You can report until {formatClockTime(focusPeriod.reportingClosesAt)} after this period ends.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECIPIENTS</Text>
          <View style={styles.recipientList}>{challenge.recipients.map((recipient) => {
            const invitation = invitations.find((item) => item.recipientId === recipient.id);
            const status = invitation?.status ?? 'ready';
            const isOrganizer=organizer?.kind==='recipient'&&organizer.recipientId===recipient.id;
            const isSharing = sharingIds.has(recipient.id);
            return <View key={recipient.id} style={styles.recipientRow}><View style={styles.recipientCopy}><Text style={styles.body}>{recipient.name}</Text>{isOrganizer&&<Text style={styles.organizerRole}>RECIPIENT AND REWARD ORGANIZER</Text>}<Text style={[styles.inviteStatus, status === 'accepted' && styles.accepted]}>{invitation ? STATUS_COPY[status] : 'Not shared'}</Text></View><Pressable accessibilityHint={`Opens the share sheet for ${recipient.name}'s private access`} accessibilityRole="button" disabled={isSharing} onPress={() => void shareInvite(recipient.id, recipient.name)} style={[styles.inviteButton, isSharing && styles.inviteButtonBusy]}><Text style={styles.inviteButtonText}>{isSharing?'Preparing…':status==='accepted'?'Share access again':invitation?'Share again':'Share invite'}</Text></Pressable></View>;
          })}</View>
          {inviteError && <Text accessibilityLiveRegion="polite" style={styles.inviteError}>{inviteError}</Text>}
        </View>

        {organizer?.kind==='other'&&<View style={styles.section}><Text style={styles.sectionLabel}>REWARD ORGANIZER</Text><View style={styles.recipientRow}><View style={styles.recipientCopy}><Text style={styles.body}>{organizer.displayName}</Text><Text style={[styles.inviteStatus,organizer.status==='accepted'&&styles.accepted]}>{organizer.status?STATUS_COPY[organizer.status]:'Not shared'}</Text></View><Pressable accessibilityHint={`Opens the share sheet for ${organizer.displayName}'s private access`} accessibilityRole="button" disabled={sharingIds.has('organizer')} onPress={()=>void shareOrganizerInvite()} style={[styles.inviteButton, sharingIds.has('organizer') && styles.inviteButtonBusy]}><Text style={styles.inviteButtonText}>{sharingIds.has('organizer')?'Preparing…':organizer.status==='accepted'?'Share access again':organizer.invitationId?'Share again':'Share access'}</Text></Pressable></View></View>}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IF MISSED</Text>
          <Text style={styles.body}>{consequence.recipientsCompact} · {consequence.categoryLabel} · {consequence.stakeLabel}</Text>
          <Text style={styles.bodyMuted}>The stake funds their experience. You will not take part.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  header: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: theme.spacing.medium,
  },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  content: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 18, paddingBottom: theme.spacing.large, gap: 22,
  },
  section: { gap: 4 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  goal: { color: theme.colors.ivory, fontSize: 20, fontWeight: '600' },
  identityHeadline: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  identityRule: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
  body: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  bodyMuted: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 18 },
  recipientList: { gap: 8, marginTop: 4 },
  recipientRow: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: theme.colors.structureLine, borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface },
  recipientCopy:{flex:1,paddingVertical:9,paddingRight:8},
  inviteStatus: { color: theme.colors.ivoryMuted, fontSize: 12, marginTop: 2 }, accepted: { color: theme.colors.sage },
  organizerRole:{color:theme.colors.rosewood,fontSize:9,fontWeight:'900',letterSpacing:1.1,marginTop:3},
  inviteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, inviteButtonBusy: { opacity: 0.6 }, inviteButtonText: { color: theme.colors.rosewood, fontWeight: '800', fontSize: 13 }, inviteError: { color: theme.colors.crimsonBright, fontSize: 13, lineHeight: 18 },
  shareAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  shareActionText: { color: theme.colors.ivory, fontSize: 14, fontWeight: '700' },
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.medium },
  emptyText: { color: theme.colors.ivoryMuted, fontSize: 15, textAlign: 'center' },
});
