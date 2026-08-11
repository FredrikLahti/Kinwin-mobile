import { Feather } from '@expo/vector-icons';
import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { describeChallengeIdentity } from '@/lib/home/challenge-summary';
import { describeChallengeResult, formatCompletedDate } from '@/lib/home/completed-challenge';
import { CompletedChallenge, fetchCompletedChallenge } from '@/lib/supabase/completed-challenge-repository';
import { buildRecipientInvitationUrl } from '@/lib/recipient-invitations/url';
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
        {state.kind === 'ready' && <ResultContent challenge={state.data} saved={saved} onHome={() => router.replace('/home' as Href)} onPlaybook={() => router.push(`/playbook/edit?sourceChallengeId=${state.data.id}&returnTo=${encodeURIComponent(`/home/result?id=${state.data.id}`)}` as Href)} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultContent({ challenge, saved, onHome, onPlaybook }: { readonly challenge: CompletedChallenge; readonly saved: boolean; readonly onHome: () => void; readonly onPlaybook: () => void }) {
  const result = describeChallengeResult(challenge.status);
  const identity = describeChallengeIdentity(challenge.snapshot);
  const recipientNames = challenge.snapshot.recipients.map((recipient) => recipient.name);
  const consequence = challenge.consequence && recipientNames.length > 0
    ? `${formatStake(challenge.consequence.stakeMinorUnits, challenge.consequence.currency)} for ${recipientNames.join(', ')}`
    : null;
  return <>
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
      <Text style={styles.blockLabel}>CONSEQUENCE ATTACHED</Text>
      <Text style={styles.consequenceText}>{consequence}</Text>
      <Text style={styles.consequenceNote}>This describes the consequence connected to the challenge. It does not confirm payment or delivery.</Text>
    </View>}

    <RewardOrganizerAccess challengeId={challenge.id}/>

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
  </>;
}

function RewardOrganizerAccess({challengeId}:{readonly challengeId:string}){const[organizer,setOrganizer]=useState<OwnerRewardOrganizer|null>(null);const[error,setError]=useState<string|null>(null);useEffect(()=>{void fetchOwnerRewardOrganizer(challengeId).then(result=>result.ok?setOrganizer(result.value):setError(result.message));},[challengeId]);if(!organizer)return error?<Text style={styles.error}>{error}</Text>:null;const share=async()=>{const prepared=organizer.kind==='recipient'&&organizer.recipientId?await createRecipientInvitation(organizer.recipientId):await createOrganizerInvitation(organizer.id);if(!prepared.ok){setError(prepared.message);return;}const url=buildRecipientInvitationUrl(process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL,prepared.value.token);if(!url){setError('A public invitation URL has not been configured yet.');return;}const result=await Share.share({message:`Hi ${organizer.displayName}, I chose you to organize the reward for my Kinwin challenge. Open your private invitation: ${url}`,url});if(result.action===Share.sharedAction)await markRecipientInvitationShared(prepared.value.invitationId);const refreshed=await fetchOwnerRewardOrganizer(challengeId);if(refreshed.ok)setOrganizer(refreshed.value);};return <View style={styles.organizerBlock}><Text style={styles.blockLabel}>REWARD ORGANIZER</Text><Text style={styles.consequenceText}>{organizer.displayName}</Text><Text style={styles.consequenceNote}>{organizer.status==='accepted'?'Organizer access accepted.':organizer.status==='declined'?'Organizer invitation declined.':organizer.status==='sent'?'Awaiting response.':'Private access has not been shared.'}</Text><Pressable accessibilityHint={`Opens the share sheet for ${organizer.displayName}'s organizer access`} accessibilityRole="button" onPress={()=>void share()} style={styles.secondary}><Text style={styles.secondaryText}>{organizer.invitationId?'Share again':'Share organizer invite'}</Text></Pressable>{error&&<Text style={styles.error}>{error}</Text>}</View>}

function Message({ title, body, onPress }: { readonly title: string; readonly body: string; readonly onPress: () => void }) {
  return <View style={styles.message}><Text accessibilityRole="header" style={styles.messageTitle}>{title}</Text><Text style={styles.meaning}>{body}</Text><Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}><Text style={styles.secondaryText}>Continue</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  content: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 40, gap: 15 },
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
  consequenceNote: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  organizerBlock:{borderTopWidth:1,borderTopColor:theme.colors.structureLineStrong,paddingTop:16,gap:8},
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
