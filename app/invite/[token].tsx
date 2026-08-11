import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { canOpenOrganizerReward, recipientRoleLabel, rewardLinkErrorMessage } from '@/lib/reward-journey';
import { accessRecipientInvitation, generateOrganizerRewardLink, RecipientProjection } from '@/lib/supabase/recipient-invitation-repository';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; invitation: RecipientProjection; saving: boolean };

export default function RecipientInvitationScreen() {
  const value=useLocalSearchParams<{token?:string|string[]}>().token;
  const token=Array.isArray(value)?value[0]??'':value??'';
  const[state,setState]=useState<State>({kind:'loading'});
  const[rewardError,setRewardError]=useState<string|null>(null);

  const load=useCallback(async()=>{setState({kind:'loading'});const result=await accessRecipientInvitation(token);setState(result.ok?{kind:'ready',invitation:result.value,saving:false}:{kind:'error',message:result.message});},[token]);
  useEffect(()=>{void load();},[load]);
  const respond=async(action:'accept'|'decline')=>{if(state.kind!=='ready'||state.saving)return;setState({...state,saving:true});const result=await accessRecipientInvitation(token,action);setState(result.ok?{kind:'ready',invitation:result.value,saving:false}:{kind:'error',message:result.message});};
  const openReward=async()=>{if(state.kind!=='ready'||state.saving)return;setRewardError(null);setState({...state,saving:true});const result=await generateOrganizerRewardLink(token);setState({...state,saving:false});if(!result.ok){setRewardError(rewardLinkErrorMessage(result.kind));return;}try{await Linking.openURL(result.value);}catch{setRewardError('The reward link could not be opened. Please try again.');}};

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><ScrollView contentContainerStyle={s.content}>
    <Text style={s.wordmark}>KINWIN</Text>
    {state.kind==='loading'&&<View accessibilityLabel="Loading private invitation" style={s.center}><ActivityIndicator color={theme.colors.rosewood}/><Text style={s.body}>Opening your private invitation…</Text></View>}
    {state.kind==='error'&&<View style={s.center}><Text accessibilityRole="header" style={s.title}>Invitation unavailable</Text><Text style={s.body}>{state.message}</Text><Pressable accessibilityHint="Tries to open this invitation again" accessibilityRole="button" onPress={()=>void load()} style={s.secondary}><Text style={s.secondaryText}>Try again</Text></Pressable></View>}
    {state.kind==='ready'&&<InvitationContent invitation={state.invitation} rewardError={rewardError} saving={state.saving} onOpenReward={()=>void openReward()} onRespond={(action)=>void respond(action)}/>}
  </ScrollView></SafeAreaView>;
}

function InvitationContent({invitation,rewardError,saving,onOpenReward,onRespond}:{readonly invitation:RecipientProjection;readonly rewardError:string|null;readonly saving:boolean;readonly onOpenReward:()=>void;readonly onRespond:(action:'accept'|'decline')=>void}){
  const isOrganizer=invitation.accessRole==='organizer';
  const canOpen=canOpenOrganizerReward({accessRole:invitation.accessRole,invitationStatus:invitation.status,rewardStatus:invitation.rewardStatus});
  return <>
    <Text style={[s.eyebrow,invitation.status==='accepted'&&s.accepted]}>{recipientRoleLabel(invitation.accessRole,invitation.recipientName)}</Text>
    <Text accessibilityRole="header" style={s.title}>{invitation.ownerName} chose you.</Text>
    <Text style={s.body}>{isOrganizer?'You are trusted to organize the reward if this challenge is not kept.':'You are one of the people who may receive the reward if this challenge is not kept.'}</Text>
    <View style={s.card}><Text style={s.label}>THE CHALLENGE</Text><Text style={s.cardTitle}>{invitation.behavior}</Text><Text style={s.goal}>Goal: {invitation.goal}</Text>{isOrganizer&&<Text style={s.goal}>Reward recipients: {invitation.recipientNames.join(', ')}</Text>}<Text style={s.consequence}>{invitation.ownerName} has promised to sit out the {invitation.consequenceCategory.toLowerCase()} experience.</Text>{!isOrganizer&&invitation.organizerName&&<Text style={s.goal}>{invitation.organizerName} is organizing the reward.</Text>}</View>
    {invitation.status==='accepted'?<View style={s.response}><Text style={s.acceptedTitle}>{isOrganizer?'You are organizing the reward':'Invitation accepted'}</Text><Text style={s.body}>You can return here using the same private link.</Text>{isOrganizer&&<RewardState status={invitation.rewardStatus}/>} {canOpen&&<Pressable accessibilityHint="Generates and opens your private reward link" accessibilityLabel="Open reward" accessibilityRole="button" disabled={saving} onPress={onOpenReward} style={({pressed})=>[s.primary,pressed&&s.pressed,saving&&s.disabled]}><Text style={s.primaryText}>{saving?'Opening…':'Open reward'}</Text></Pressable>}{rewardError&&<Text accessibilityLiveRegion="polite" style={s.notice}>{rewardError}</Text>}</View>:invitation.status==='declined'?<View style={s.response}><Text style={s.declinedTitle}>Invitation declined</Text><Text style={s.body}>Your response has been saved.</Text></View>:<View style={s.actions}><Pressable accessibilityHint="Accepts this private challenge role" accessibilityRole="button" disabled={saving} onPress={()=>onRespond('accept')} style={({pressed})=>[s.primary,pressed&&s.pressed,saving&&s.disabled]}><Text style={s.primaryText}>{saving?'Saving…':'Accept invitation'}</Text></Pressable><Pressable accessibilityHint="Declines this private challenge role" accessibilityRole="button" disabled={saving} onPress={()=>onRespond('decline')} style={({pressed})=>[s.secondary,pressed&&s.pressed]}><Text style={s.secondaryText}>Decline</Text></Pressable></View>}
    <Text style={s.privacy}>This private page does not create a Kin connection or reveal check-ins.</Text>
  </>;
}

function RewardState({status}:{readonly status:RecipientProjection['rewardStatus']}){if(status==='ready')return <Text style={s.ready}>The reward is ready.</Text>;if(status==='needs_attention')return <Text style={s.notice}>We could not prepare the reward yet. Kinwin needs to take another look.</Text>;if(status==='processing')return <Text style={s.body}>The reward is still being prepared.</Text>;return <Text style={s.body}>Reward preparation will continue when the challenge and consequence are settled.</Text>;}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:theme.colors.ink},content:{flexGrow:1,width:'100%',maxWidth:560,alignSelf:'center',padding:24,paddingBottom:48,gap:16},wordmark:{color:theme.colors.ivory,fontSize:12,fontWeight:'800',letterSpacing:4,marginVertical:12},center:{marginTop:70,gap:16},eyebrow:{color:theme.colors.rosewood,fontSize:10,fontWeight:'900',letterSpacing:1.7,marginTop:24},accepted:{color:theme.colors.sage},title:{color:theme.colors.ivory,fontFamily:'Georgia',fontSize:34,lineHeight:40},body:{color:theme.colors.ivoryMuted,fontSize:15,lineHeight:22},card:{marginTop:6,padding:18,gap:8,borderRadius:theme.radius.controlled,backgroundColor:theme.colors.surfaceRaised,borderWidth:1,borderColor:theme.colors.oxblood},label:{color:theme.colors.rosewood,fontSize:9,fontWeight:'900',letterSpacing:1.4},cardTitle:{color:theme.colors.ivory,fontSize:21,fontWeight:'700',lineHeight:27},goal:{color:theme.colors.ivoryMuted,fontSize:14,lineHeight:20},consequence:{color:theme.colors.ivory,fontSize:15,lineHeight:22,marginTop:8},actions:{gap:10,marginTop:8},primary:{minHeight:52,alignItems:'center',justifyContent:'center',borderRadius:theme.radius.controlled,backgroundColor:theme.colors.rosewood},primaryText:{color:theme.colors.ivory,fontWeight:'800',fontSize:15},secondary:{minHeight:50,alignItems:'center',justifyContent:'center',borderRadius:theme.radius.controlled,borderWidth:1,borderColor:theme.colors.structureLineStrong},secondaryText:{color:theme.colors.ivoryMuted,fontWeight:'700'},pressed:{opacity:.78},disabled:{opacity:.6},response:{paddingVertical:14,gap:10},acceptedTitle:{color:theme.colors.sage,fontSize:18,fontWeight:'800'},ready:{color:theme.colors.sage,fontSize:15,fontWeight:'800'},declinedTitle:{color:theme.colors.ivory,fontSize:18,fontWeight:'800'},notice:{color:theme.colors.ivory,fontSize:14,lineHeight:20},privacy:{color:theme.colors.warmGrey,fontSize:12,lineHeight:18,marginTop:10}});
