import { Feather } from '@expo/vector-icons';
import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntranceTransitionV2 } from '@/components/v2/entrance-transition';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { describeChallengeIdentity } from '@/lib/home/challenge-summary';
import { describeChallengeResult, formatCompletedDate } from '@/lib/home/completed-challenge';
import { resultEntranceTracker } from '@/lib/home/result-entrance';
import { playConsequenceHaptic, playSuccessHaptic } from '@/lib/haptics';
import { resolveChallengeResultHapticOutcome } from '@/lib/haptics-outcome';
import { describeOwnerPaymentStatus } from '@/lib/payment-journey';
import { describeOwnerRewardStatus, formatPeople } from '@/lib/reward-journey';
import { CompletedChallenge, fetchCompletedChallenge } from '@/lib/supabase/completed-challenge-repository';
import { buildRecipientInvitationUrl } from '@/lib/recipient-invitations/url';
import { buildInvitationShareContent } from '@/lib/recipient-invitations/share';
import { createOrganizerInvitation,createRecipientInvitation,fetchOwnerRewardOrganizer,markRecipientInvitationShared,OwnerRewardOrganizer } from '@/lib/supabase/recipient-invitation-repository';

type State = { readonly kind: 'loading' } | { readonly kind: 'missing' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'ready'; readonly data: CompletedChallenge };

function oneParam(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function formatStake(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minorUnits / 100);
}

export default function ChallengeResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; saved?: string | string[] }>();
  const challengeId = oneParam(params.id);
  const saved = oneParam(params.saved) === '1';
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!user || !challengeId) { setState({ kind: 'missing' }); return; }
    const result = await fetchCompletedChallenge(user.id, challengeId);
    if (!result.ok) setState({ kind: 'error', message: 'message' in result ? result.message : 'Could not load this result.' });
    else setState(result.data ? { kind: 'ready', data: result.data } : { kind: 'missing' });
  }, [challengeId, user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityHint="Returns to Home" accessibilityLabel="Go to Home" accessibilityRole="button" onPress={() => router.replace('/home' as Href)} style={styles.iconButton}>
            <Feather color={theme.colors.ivory} name="chevron-left" size={24} />
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>

        {state.kind === 'loading' && <ActivityIndicator color={theme.colors.rosewood} style={styles.loader} />}
        {state.kind === 'error' && <Message title="Could not load this result." body={state.message} onPress={() => void load()} />}
        {state.kind === 'missing' && <Message title="This result is not available." body="Return Home to see your current challenge." onPress={() => router.replace('/home' as Href)} />}
        {state.kind === 'ready' && <ResultContent
          key={state.data.id}
          challenge={state.data}
          saved={saved}
          onHome={() => router.replace('/home' as Href)}
          onPlaybook={() => router.push(`/playbook/edit?sourceChallengeId=${state.data.id}&returnTo=${encodeURIComponent(`/home/result?id=${state.data.id}`)}` as Href)}
          onUpdatePayment={() => router.push(`/account/payment-recovery?challengeId=${state.data.id}&returnTo=${encodeURIComponent(`/home/result?id=${state.data.id}`)}` as Href)}
        />}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultContent({ challenge, saved, onHome, onPlaybook, onUpdatePayment }: { readonly challenge: CompletedChallenge; readonly saved: boolean; readonly onHome: () => void; readonly onPlaybook: () => void; readonly onUpdatePayment: () => void }) {
  const reducedMotion = useReducedMotion();
  const result = describeChallengeResult(challenge.status);
  const identity = describeChallengeIdentity(challenge.snapshot);
  const recipientNames = challenge.snapshot.recipients.map((recipient) => recipient.name);
  const people = formatPeople(recipientNames);
  const consequence = challenge.consequence && recipientNames.length > 0
    ? `${formatStake(challenge.consequence.stakeMinorUnits, challenge.consequence.currency)} for ${recipientNames.join(', ')}`
    : null;

  // True only the very first time this particular finalized challenge is
  // shown, within this app's current JS session — see
  // lib/home/result-entrance.ts's own comment for exactly what that means
  // across a real app restart. Resolved synchronously via a lazy
  // initializer, not from an effect: EntranceTransitionV2's `play` prop
  // must already be correct on ResultContent's very first render (see that
  // component's own doc comment) — setting this later would show the
  // content fully visible and unanimated first, then flip `play` to true
  // once the animation window has already passed. The parent screen keys
  // ResultContent by challenge id, so a different finalized challenge
  // always gets a fresh mount (and therefore a fresh, correct read here)
  // rather than reusing this instance's already-resolved value.
  const [isFirstPresentation] = useState(() => resultEntranceTracker.shouldPlay(challenge.id));
  useEffect(() => {
    if (!isFirstPresentation) return;
    const outcome = resolveChallengeResultHapticOutcome(challenge.status);
    void (outcome === 'success' ? playSuccessHaptic() : playConsequenceHaptic());
  }, [challenge.status, isFirstPresentation]);

  return (
    <EntranceTransitionV2 play={isFirstPresentation} reducedMotion={reducedMotion}>
      <View style={styles.resultStack}>
        <Text style={[styles.eyebrow, result.tone === 'success' && styles.success]}>{result.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{result.headline}</Text>
        <Text style={styles.meaning}>{result.meaning}</Text>

        <View style={styles.challengeBlock}>
          <Text style={styles.blockLabel}>THE CHALLENGE</Text>
          <Text style={styles.challengeTitle}>{identity.headline}</Text>
          {identity.ruleDetail && <Text style={styles.rule}>{identity.ruleDetail}</Text>}
          <Text style={styles.date}>Completed {formatCompletedDate(challenge.completedAt)}</Text>
        </View>

        {challenge.status === 'completed_failure' && consequence && <View style={styles.consequenceBlock}>
          <Text style={styles.blockLabel}>THE OTHER SIDE OF THE PROMISE</Text>
          <Text style={styles.winText}>{people} win.</Text>
          <Text style={styles.consequenceText}>{consequence}</Text>
          <Text style={styles.consequenceNote}>You sit this one out. The reward is prepared separately from the final challenge result.</Text>
        </View>}

        {challenge.status === 'completed_failure' && challenge.paymentStatus && <PaymentAttentionBanner onUpdatePayment={onUpdatePayment} status={challenge.paymentStatus} />}

        {challenge.status === 'completed_failure' && <RewardOrganizerAccess challenge={challenge}/>}

        <View style={styles.reflectionBlock}>
          <Text style={styles.reflectionTitle}>What is worth remembering for next time?</Text>
          <Text style={styles.reflectionBody}>Optionally save your own short lesson to Personal Playbook.</Text>
          {saved && <Text accessibilityLiveRegion="polite" style={styles.saved}>Saved to Personal Playbook.</Text>}
          <Pressable accessibilityHint="Opens the Personal Playbook editor with this challenge attached" accessibilityRole="button" onPress={onPlaybook} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{saved ? 'Save another lesson' : 'Save a lesson'}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityHint="Returns Home where you can start another challenge" accessibilityRole="button" onPress={onHome} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Back to Home</Text>
        </Pressable>
      </View>
    </EntranceTransitionV2>
  );
}

function PaymentAttentionBanner({ status, onUpdatePayment }: { readonly status: NonNullable<CompletedChallenge['paymentStatus']>; readonly onUpdatePayment: () => void }) {
  const presentation = describeOwnerPaymentStatus(status);
  if (!presentation) return null;
  return (
    <View style={styles.paymentBlock}>
      <Text style={styles.blockLabel}>PAYMENT</Text>
      <Text style={styles.paymentStatus}>{presentation.label}</Text>
      <Text style={styles.consequenceNote}>{presentation.detail}</Text>
      <Pressable accessibilityHint="Opens Stripe's secure payment form to save a new card" accessibilityRole="button" onPress={onUpdatePayment} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Update payment method</Text>
      </Pressable>
    </View>
  );
}

function RewardOrganizerAccess({challenge}:{readonly challenge:CompletedChallenge}){const[organizer,setOrganizer]=useState<OwnerRewardOrganizer|null>(null);const[error,setError]=useState<string|null>(null);const[sharing,setSharing]=useState(false);useEffect(()=>{void fetchOwnerRewardOrganizer(challenge.id).then(result=>result.ok?setOrganizer(result.value):setError(result.message));},[challenge.id]);if(!organizer||!challenge.rewardProgress)return error?<Text style={styles.error}>{error}</Text>:null;const presentation=describeOwnerRewardStatus(challenge.rewardProgress);const share=async()=>{if(sharing)return;setSharing(true);setError(null);try{const prepared=organizer.kind==='recipient'&&organizer.recipientId?await createRecipientInvitation(organizer.recipientId):await createOrganizerInvitation(organizer.id);if(!prepared.ok){setError(prepared.message);return;}const url=buildRecipientInvitationUrl(process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL,prepared.value.token);if(!url){setError('Private sharing is not available right now.');return;}const result=await Share.share(buildInvitationShareContent(`Hi ${organizer.displayName}, here is your private access to organize the reward for my Kinwin challenge:`,url));if(result.action===Share.sharedAction)await markRecipientInvitationShared(prepared.value.invitationId);const refreshed=await fetchOwnerRewardOrganizer(challenge.id);if(refreshed.ok)setOrganizer(refreshed.value);}finally{setSharing(false);}};return <View style={styles.organizerBlock}><Text style={styles.blockLabel}>REWARD ORGANIZER</Text><Text style={styles.consequenceText}>{organizer.displayName}{organizer.kind==='recipient'?' is also a recipient.':''}</Text><Text accessibilityLiveRegion="polite" style={[styles.rewardStatus,presentation.tone==='success'&&styles.rewardSuccess,presentation.tone==='attention'&&styles.rewardAttention]}>{presentation.label}</Text><Text style={styles.consequenceNote}>{presentation.detail}</Text><Pressable accessibilityHint={`Opens the share sheet for ${organizer.displayName}'s private access`} accessibilityRole="button" disabled={sharing} onPress={()=>void share()} style={[styles.secondary,sharing&&styles.pressed]}><Text style={styles.secondaryText}>{sharing?'Preparing…':organizer.status==='accepted'?'Share access again':organizer.invitationId?'Share again':'Share organizer access'}</Text></Pressable>{error&&<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}</View>}

function Message({ title, body, onPress }: { readonly title: string; readonly body: string; readonly onPress: () => void }) {
  return <View style={styles.message}><Text accessibilityRole="header" style={styles.messageTitle}>{title}</Text><Text style={styles.meaning}>{body}</Text><Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}><Text style={styles.secondaryText}>Continue</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  content: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 40, gap: 15 },
  // Mirrors content's own gap: ResultContent's fields render inside a
  // single EntranceTransitionV2 wrapper now (so the whole block can fade
  // in together as one unit), which means they're no longer direct
  // children of `content` — this keeps the same visual spacing between
  // them regardless.
  resultStack: { gap: 15 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  loader: { marginTop: 80 },
  eyebrow: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginTop: 10 },
  success: { color: theme.colors.sage },
  title: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 38, lineHeight: 44 },
  meaning: { color: theme.colors.ivoryMuted, fontSize: 16, lineHeight: 24, maxWidth: 470 },
  challengeBlock: { borderTopWidth: 1, borderTopColor: theme.colors.structureLineStrong, paddingTop: 18, marginTop: 10, gap: 6 },
  blockLabel: { color: theme.colors.rosewood, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  challengeTitle: { color: theme.colors.ivory, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  rule: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  date: { color: theme.colors.warmGrey, fontSize: 12, marginTop: 4 },
  consequenceBlock: { borderRadius: theme.radius.controlled, backgroundColor: theme.colors.oxbloodDeep, borderWidth: 1, borderColor: theme.colors.oxblood, padding: 16, gap: 7 },
  consequenceText: { color: theme.colors.ivory, fontSize: 16, fontWeight: '700' },
  winText: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 24, lineHeight: 30 },
  consequenceNote: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  paymentBlock: { borderRadius: theme.radius.controlled, backgroundColor: theme.colors.oxbloodDeep, borderWidth: 1, borderColor: theme.colors.oxblood, padding: 16, gap: 7 },
  paymentStatus: { color: theme.colors.ivory, fontSize: 15, fontWeight: '800' },
  organizerBlock:{borderTopWidth:1,borderTopColor:theme.colors.structureLineStrong,paddingTop:16,gap:8},
  rewardStatus:{color:theme.colors.ivoryMuted,fontSize:15,fontWeight:'800'},
  rewardSuccess:{color:theme.colors.sage},
  rewardAttention:{color:theme.colors.rosewood},
  reflectionBlock: { borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.structureLineStrong, padding: 17, gap: 9, marginTop: 4 },
  reflectionTitle: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 21, lineHeight: 27 },
  reflectionBody: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  saved: { color: theme.colors.sage, fontSize: 13, fontWeight: '800' },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, backgroundColor: theme.colors.rosewood, marginTop: 3 },
  primaryText: { color: theme.colors.ivory, fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong },
  secondaryText: { color: theme.colors.ivory, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.78 },
  message: { marginTop: 60, gap: 16 },
  messageTitle: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 29, lineHeight: 35 },
  error:{color:theme.colors.crimsonBright,fontSize:13,lineHeight:19},
});
