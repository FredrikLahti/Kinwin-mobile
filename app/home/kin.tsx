import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarV2 } from '@/components/v2/avatar';
import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SegmentedControlV2 } from '@/components/v2/segmented-control';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSelectionHaptic } from '@/lib/haptics';
import { describeActivityEvent } from '@/lib/home/activity-summary';
import { describeChallengeIdentity } from '@/lib/home/challenge-summary';
import {
  ActivityItem,
  KinConnection,
  KinCurrentChallenge,
  KinSearchResult,
  REACTION_KINDS,
  REPORT_REASONS,
  ReactionKind,
  ReportReason,
  acceptKinRequest,
  blockKin,
  cancelKinRequest,
  clearMyReaction,
  declineKinRequest,
  fetchKinActivity,
  fetchKinConnections,
  fetchKinCurrentChallenges,
  fetchMyKinCode,
  redeemKinCode,
  removeKin,
  searchKin,
  sendKinRequest,
  setMyReaction,
  submitSocialReport,
} from '@/lib/supabase/kin-repository';

type Tab = 'activity' | 'people';

const REACTION_LABELS: Record<ReactionKind, string> = {
  respect: 'Respect', nice: 'Nice', worth_it: 'Worth it', ouch: 'Ouch', brutal: 'Brutal',
};

const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate_or_abuse: 'Hate or abusive content',
  sexual_content: 'Sexual or inappropriate content',
  spam: 'Spam',
  other: 'Other',
};

type ReportTarget = { readonly userId: string; readonly displayName: string; readonly activityId: string | null };

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function KinV2() {
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('activity');
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<readonly KinConnection[]>([]);
  const [activity, setActivity] = useState<readonly ActivityItem[]>([]);
  const [currentChallenges, setCurrentChallenges] = useState<readonly KinCurrentChallenge[]>([]);
  const [addKinOpen, setAddKinOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<KinConnection | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [redeemFeedback, setRedeemFeedback] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [showCodeFallback, setShowCodeFallback] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<readonly KinSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
  const [reactingIds, setReactingIds] = useState<Set<string>>(new Set());
  const searchRequestId = useRef(0);
  // The actual concurrency mutex for toggleReaction — a ref, not the
  // reactingIds state above, because a ref is read/written synchronously,
  // immediately, on the calling render's closure; state only takes effect
  // on the next render, which is too late to stop a second rapid tap that
  // fires before that render happens. reactingIds itself is kept only to
  // drive the disabled visual state on the reaction chips.
  const reactionInFlightRef = useRef<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Drives the disabled visual state on a reacting item's chips. Not the
  // concurrency guard itself — see reactionInFlightRef above.
  const setReacting = (id: string, busy: boolean) => {
    setReactingIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const refresh = useCallback(async () => {
    if (!user) return;
    const [connectionsResult, activityResult, currentResult] = await Promise.all([
      fetchKinConnections(user.id),
      fetchKinActivity(user.id),
      fetchKinCurrentChallenges(user.id),
    ]);
    if (connectionsResult.ok) setConnections(connectionsResult.connections);
    if (activityResult.ok) setActivity(activityResult.items);
    if (currentResult.ok) setCurrentChallenges(currentResult.challenges);
    setLoading(false);
  }, [user]);

  // The Kin tab stays mounted across visits (it lives inside the same Tabs
  // navigator as Home/Me — see app/home/_layout.tsx), so a plain
  // mount-only fetch would leave requests/connections/activity stale for
  // the rest of the session after the first visit — e.g. a request someone
  // else already accepted/declined/canceled elsewhere would keep showing
  // here as if still actionable. useFocusEffect re-pulls server truth every
  // time this tab gains focus, matching the same pattern Home already uses
  // for its own Kin preview (app/home/index.tsx).
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  // A `tab` route param lets a caller (Home's "See all") explicitly request
  // a section instead of relying on stale local state — this only fires
  // when the param itself changes, so it never fights normal manual
  // segmented-control taps afterward.
  useEffect(() => {
    if (params.tab === 'activity' || params.tab === 'people') setTab(params.tab);
  }, [params.tab]);

  useEffect(() => {
    if (!addKinOpen || !user || myCode) return;
    void fetchMyKinCode(user.id).then((result) => {
      if (result.ok) setMyCode(result.kinCode);
    });
  }, [addKinOpen, user, myCode]);

  // Debounced person search — the primary Add-Kin flow. A request id guard
  // discards a stale response that resolves after a newer keystroke's
  // search already landed, so results can never flicker back to an older
  // query's answer.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const requestId = ++searchRequestId.current;
    const timeout = setTimeout(() => {
      void searchKin(query).then((result) => {
        if (searchRequestId.current !== requestId) return;
        setSearching(false);
        if (!result.ok) {
          setSearchError('Could not search right now.');
          setSearchResults([]);
          return;
        }
        setSearchResults(result.results);
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const accepted = connections.filter((c) => c.status === 'accepted');
  const incoming = connections.filter((c) => c.status === 'pending' && c.direction === 'incoming');
  const outgoing = connections.filter((c) => c.status === 'pending' && c.direction === 'outgoing');

  // A challenge already surfaced by a real event (Started/Completed/
  // Missed) in the fetched activity window isn't repeated as "current" —
  // current state is only shown when no event already tells that story.
  const eventChallengeIds = new Set(activity.map((item) => item.challengeId).filter((id): id is string => id !== null));
  const visibleCurrentChallenges = currentChallenges.filter((c) => !eventChallengeIds.has(c.challengeId));

  const shareMyCode = async () => {
    void playSelectionHaptic();
    if (!myCode) return;
    await Share.share({ message: `Add me as your Kin on Kinwin. My code: ${myCode}` });
  };

  const submitCode = async () => {
    const code = codeInput.trim();
    if (!code) return;
    void playSelectionHaptic();
    setRedeemFeedback(null);
    const result = await redeemKinCode(code);
    if (!result.ok) {
      setRedeemFeedback(result.kind === 'rejected' ? (result.message ?? 'That code did not work.') : 'Something went wrong. Try again.');
      return;
    }
    setCodeInput('');
    if (result.status === 'requested') setRedeemFeedback('Request sent.');
    else if (result.status === 'already_pending') setRedeemFeedback('You already have a pending request with them.');
    else setRedeemFeedback('You are already Kin.');
    void refresh();
  };

  const handleSendRequest = async (result: KinSearchResult) => {
    void playSelectionHaptic();
    setSendingRequestTo(result.userId);
    const outcome = await sendKinRequest(result.userId);
    setSendingRequestTo(null);
    if (!outcome.ok) {
      Alert.alert('Could not send that request', outcome.kind === 'rejected' ? (outcome.message ?? '') : 'Please try again.');
      return;
    }
    setSearchResults((current) => current.map((entry) => (
      entry.userId === result.userId ? { ...entry, connectionStatus: 'pending', connectionDirection: 'outgoing' } : entry
    )));
    void refresh();
  };

  const respondToRequest = async (connection: KinConnection, action: 'accept' | 'decline' | 'cancel') => {
    void playSelectionHaptic();
    setBusy(connection.connectionId, true);
    const result = action === 'accept' ? await acceptKinRequest(connection.connectionId)
      : action === 'decline' ? await declineKinRequest(connection.connectionId)
      : await cancelKinRequest(connection.connectionId);
    setBusy(connection.connectionId, false);
    // Reconcile with server truth on failure too, not only on success: a
    // rejection here most often means the other party already accepted,
    // declined, or canceled this same request first — leaving the stale row
    // on screen would just let the user tap the same doomed action again.
    void refresh();
    if (!result.ok) {
      Alert.alert('Could not complete that', result.kind === 'rejected' ? (result.message ?? '') : 'Please try again.');
    }
  };

  const confirmRemove = (connection: KinConnection) => {
    Alert.alert('Remove Kin', `Remove ${connection.otherDisplayName} as Kin? They can send a new request later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          void (async () => {
            setBusy(connection.connectionId, true);
            const result = await removeKin(connection.connectionId);
            setBusy(connection.connectionId, false);
            setManageTarget(null);
            void refresh();
            if (!result.ok) { Alert.alert('Could not remove', result.kind === 'rejected' ? (result.message ?? '') : ''); }
          })();
        },
      },
    ]);
  };

  const confirmBlock = (connection: KinConnection) => {
    Alert.alert('Block Kin', `Block ${connection.otherDisplayName}? They will not be able to reconnect with you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive', onPress: () => {
          void (async () => {
            setBusy(connection.connectionId, true);
            const result = await blockKin(connection.otherUserId);
            setBusy(connection.connectionId, false);
            setManageTarget(null);
            void refresh();
            if (!result.ok) { Alert.alert('Could not block', result.kind === 'rejected' ? (result.message ?? '') : ''); }
          })();
        },
      },
    ]);
  };

  const openReport = (target: ReportTarget) => {
    void playSelectionHaptic();
    setManageTarget(null);
    setReportTarget(target);
  };

  const submitReport = async (reason: ReportReason) => {
    if (!reportTarget) return;
    void playSelectionHaptic();
    setSubmittingReport(true);
    const target = reportTarget;
    const result = await submitSocialReport(target.userId, reason, target.activityId);
    setSubmittingReport(false);
    setReportTarget(null);
    if (!result.ok) {
      Alert.alert('Could not send that report', 'Please try again.');
      return;
    }
    // Only offered from an activity card (target.activityId set) — the
    // People tab's manage sheet already has its own separate Block action
    // right next to Report, so a second prompt there would be redundant.
    if (target.activityId) {
      Alert.alert('Report sent', 'Thanks for letting us know. Our team will review this.', [
        { text: 'Done', style: 'cancel' },
        { text: `Also block ${target.displayName}`, style: 'destructive', onPress: () => void blockKin(target.userId).then(() => void refresh()) },
      ]);
    } else {
      Alert.alert('Report sent', 'Thanks for letting us know. Our team will review this.');
    }
  };

  const toggleReaction = async (item: ActivityItem, kind: ReactionKind) => {
    // reactingIds (React state) is not a valid mutex here: two rapid taps
    // can both run this function against the same pre-update render before
    // either state write has committed, so both would read reactingIds as
    // not-yet-containing item.id and pass this check. The ref is checked
    // and written synchronously, before any await, so the second call
    // always sees the first call's claim.
    if (!user || reactionInFlightRef.current.has(item.id)) return;
    reactionInFlightRef.current.add(item.id);
    void playSelectionHaptic();
    setReacting(item.id, true);
    try {
      const isMine = item.myReaction === kind;
      setActivity((current) => current.map((entry) => {
        if (entry.id !== item.id) return entry;
        const counts = { ...entry.reactionCounts };
        if (entry.myReaction) counts[entry.myReaction] = Math.max(0, (counts[entry.myReaction] ?? 1) - 1);
        if (!isMine) counts[kind] = (counts[kind] ?? 0) + 1;
        return { ...entry, myReaction: isMine ? null : kind, reactionCounts: counts };
      }));
      const result = isMine ? await clearMyReaction(user.id, item.id) : await setMyReaction(user.id, item.id, kind);
      // setMyReaction is a delete-then-insert on the server, not one atomic
      // write, so a failure can leave the server in neither the "before" nor
      // the "after" state (e.g. the delete lands but the insert doesn't) --
      // reverting to the pre-tap snapshot could show the wrong thing just as
      // easily as leaving the optimistic update in place. Re-pulling real
      // state from the server is the only safe correction.
      if (!result.ok) void refresh();
    } catch {
      // An unexpected throw (rather than a normal ReactionActionResult
      // failure) must still release the lock and reconcile with the server
      // — never leave this item's reaction chips permanently disabled.
      void refresh();
    } finally {
      reactionInFlightRef.current.delete(item.id);
      setReacting(item.id, false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>KIN</Text>
          <Pressable
            accessibilityHint="Add someone as your Kin"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => { void playSelectionHaptic(); setAddKinOpen(true); }}
            style={({ pressed }) => [styles.addAction, pressed && styles.addActionPressed]}
          >
            <Feather color={theme.colors.crimsonBright} name="user-plus" size={18} />
          </Pressable>
        </View>

        <View style={styles.segmented}>
          <SegmentedControlV2
            onChange={setTab}
            options={[{ label: 'Activity', value: 'activity' }, { label: 'People', value: 'people' }]}
            value={tab}
          />
        </View>

        {loading ? (
          <View style={styles.loadingBody}><ActivityIndicator color={theme.colors.warmGrey} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {tab === 'activity' ? (
              <>
                {incoming.map((connection) => (
                  <View key={connection.connectionId} style={styles.requestCard}>
                    <AvatarV2 size={36} />
                    <View style={styles.requestCopy}>
                      <Text style={styles.requestName}>{connection.otherDisplayName}</Text>
                      <Text style={styles.requestSubtext}>Wants to be your Kin</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyIds.has(connection.connectionId)}
                        onPress={() => void respondToRequest(connection, 'decline')}
                        style={({ pressed }) => [styles.requestButton, pressed && styles.requestButtonPressed]}
                      >
                        <Text style={styles.requestButtonLabel}>Decline</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyIds.has(connection.connectionId)}
                        onPress={() => void respondToRequest(connection, 'accept')}
                        style={({ pressed }) => [styles.requestButton, styles.requestButtonPrimary, pressed && styles.requestButtonPressed]}
                      >
                        <Text style={styles.requestButtonPrimaryLabel}>Accept</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {activity.length === 0 && incoming.length === 0 && visibleCurrentChallenges.length === 0 && (
                  <View style={styles.emptyBody}>
                    <Text style={styles.emptyTitle}>No activity yet</Text>
                    <Text style={styles.emptyText}>
                      {accepted.length === 0 ? 'Add your people to see what they’re up to.' : 'When your Kin start, finish, or miss a challenge, it shows up here.'}
                    </Text>
                  </View>
                )}

                {/* Activity = everything socially relevant about my Kin.
                    Internally that's two different kinds of truth: current
                    state (what a Kin is doing right now, even with zero
                    events) and historical events (Started, Completed,
                    Missed), but the user only ever sees one screen, one
                    concept: Activity. A Kin whose challenge predates the
                    connection must still show up here, never hidden behind
                    an events-only empty state. */}
                {visibleCurrentChallenges.length > 0 && (
                  <View style={styles.currentlySection}>
                    <Text style={styles.sectionLabel}>ACTIVE CHALLENGES</Text>
                    <View style={styles.rowGroup}>
                      {visibleCurrentChallenges.map((c) => (
                        <View key={c.challengeId} style={styles.currentRow}>
                          <AvatarV2 size={36} />
                          <View style={styles.currentRowCopy}>
                            <Text style={styles.currentRowName}>{c.ownerDisplayName}</Text>
                            <Text style={styles.currentRowBehavior}>{describeChallengeIdentity({ behavior: c.behavior }).headline}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {(visibleCurrentChallenges.length > 0 || activity.length > 0) && (
                  <View style={styles.currentlySection}>
                    <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
                    {activity.length === 0 && (
                      <Text style={styles.emptyEventsText}>No recent activity.</Text>
                    )}
                  </View>
                )}

                {activity.map((item) => (
                  <View key={item.id} style={styles.activityCard}>
                    <View style={styles.activityHeader}>
                      <AvatarV2 size={40} />
                      <View style={styles.activityCopy}>
                        <Text style={styles.activityName}>{item.ownerDisplayName}</Text>
                        <Text style={styles.activityBehavior}>{describeChallengeIdentity({ behavior: item.behavior }).headline}</Text>
                      </View>
                      <Text style={styles.activityTime}>{relativeTime(item.createdAt)}</Text>
                      {item.ownerId !== user?.id && (
                        <Pressable
                          accessibilityHint={`Reports ${item.ownerDisplayName}'s activity`}
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => openReport({ userId: item.ownerId, displayName: item.ownerDisplayName, activityId: item.id })}
                          style={styles.reportButton}
                        >
                          <Feather color={theme.colors.warmGrey} name="flag" size={14} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={[styles.activityEvent, item.kind === 'challenge_failed' && styles.activityEventFailure, item.kind === 'challenge_succeeded' && styles.activityEventSuccess]}>
                      {describeActivityEvent(item)}
                    </Text>
                    <View style={styles.reactionRow}>
                      {REACTION_KINDS.map((kind) => {
                        const mine = item.myReaction === kind;
                        const count = item.reactionCounts[kind] ?? 0;
                        return (
                          <Pressable
                            accessibilityHint={`Reacts with ${REACTION_LABELS[kind]}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: mine }}
                            disabled={reactingIds.has(item.id)}
                            key={kind}
                            onPress={() => void toggleReaction(item, kind)}
                            style={({ pressed }) => [styles.reactionChip, mine && styles.reactionChipActive, pressed && styles.reactionChipPressed]}
                          >
                            <Text style={[styles.reactionLabel, mine && styles.reactionLabelActive]}>
                              {REACTION_LABELS[kind]}{count > 0 ? ` ${count}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                {accepted.length === 0 && outgoing.length === 0 ? (
                  <View style={styles.emptyBody}>
                    <Text style={styles.emptyTitle}>Add your people</Text>
                    <Text style={styles.emptyText}>Search by name or email to connect.</Text>
                    <Pressable
                      accessibilityHint="Opens adding a new Kin"
                      accessibilityRole="button"
                      onPress={() => { void playSelectionHaptic(); setAddKinOpen(true); }}
                      style={({ pressed }) => [styles.addKinButton, pressed && styles.addKinButtonPressed]}
                    >
                      <Feather color={theme.colors.crimsonBright} name="user-plus" size={16} />
                      <Text style={styles.addKinLabel}>Add Kin</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {accepted.length > 0 && (
                      <View style={styles.rowGroup}>
                        {accepted.map((connection) => (
                          <Pressable
                            accessibilityHint="Manage this Kin"
                            accessibilityRole="button"
                            key={connection.connectionId}
                            onPress={() => setManageTarget(connection)}
                            style={({ pressed }) => [styles.personRow, pressed && styles.personRowPressed]}
                          >
                            <AvatarV2 size={40} />
                            <Text style={styles.personName}>{connection.otherDisplayName}</Text>
                            <Feather color={theme.colors.warmGrey} name="more-horizontal" size={18} />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {outgoing.length > 0 && (
                      <View style={styles.rowGroup}>
                        {outgoing.map((connection) => (
                          <View key={connection.connectionId} style={styles.personRow}>
                            <AvatarV2 size={40} />
                            <Text style={styles.personName}>{connection.otherDisplayName}</Text>
                            <Text style={styles.pendingTag}>Pending</Text>
                            <Pressable
                              accessibilityHint="Cancels this request"
                              accessibilityRole="button"
                              disabled={busyIds.has(connection.connectionId)}
                              hitSlop={8}
                              onPress={() => void respondToRequest(connection, 'cancel')}
                              style={styles.cancelRequestButton}
                            >
                              <Feather color={theme.colors.warmGrey} name="x" size={16} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}

                    <Pressable
                      accessibilityHint="Opens adding a new Kin"
                      accessibilityRole="button"
                      onPress={() => { void playSelectionHaptic(); setAddKinOpen(true); }}
                      style={({ pressed }) => [styles.addKinButton, pressed && styles.addKinButtonPressed]}
                    >
                      <Feather color={theme.colors.crimsonBright} name="user-plus" size={16} />
                      <Text style={styles.addKinLabel}>Add Kin</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <BottomSheetV2
        onClose={() => { setAddKinOpen(false); setSearchQuery(''); setSearchResults([]); setRedeemFeedback(null); setShowCodeFallback(false); }}
        reducedMotion={reducedMotion}
        visible={addKinOpen}
      >
        <Text style={styles.sheetTitle}>Add Kin</Text>

        <View style={styles.sheetSection}>
          <TextInputV2
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="Search by name or email"
            placeholderTextColor={theme.colors.warmGrey}
            style={styles.searchInput}
            value={searchQuery}
          />

          {searching && (
            <View style={styles.searchLoadingRow}><ActivityIndicator color={theme.colors.warmGrey} size="small" /></View>
          )}
          {searchError && <Text style={styles.sheetFeedback}>{searchError}</Text>}
          {!searching && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <Text style={styles.sheetFeedback}>No one found.</Text>
          )}

          {searchResults.length > 0 && (
            <View style={styles.rowGroup}>
              {searchResults.map((result) => (
                <View key={result.userId} style={styles.searchResultRow}>
                  <AvatarV2 size={36} />
                  <Text numberOfLines={1} style={styles.searchResultName}>{result.displayName}</Text>
                  {result.connectionStatus === 'none' && (
                    <Pressable
                      accessibilityHint={`Sends ${result.displayName} a Kin request`}
                      accessibilityRole="button"
                      disabled={sendingRequestTo === result.userId}
                      onPress={() => void handleSendRequest(result)}
                      style={({ pressed }) => [styles.searchAddButton, pressed && styles.searchAddButtonPressed]}
                    >
                      <Text style={styles.searchAddButtonLabel}>Add</Text>
                    </Pressable>
                  )}
                  {result.connectionStatus === 'pending' && result.connectionDirection === 'outgoing' && (
                    <Text style={styles.searchStateLabel}>Requested</Text>
                  )}
                  {result.connectionStatus === 'pending' && result.connectionDirection === 'incoming' && (
                    <Text style={styles.searchStateLabel}>Incoming request</Text>
                  )}
                  {result.connectionStatus === 'accepted' && <Text style={styles.searchStateLabel}>Already Kin</Text>}
                  {result.connectionStatus === 'blocked' && <Text style={styles.searchStateLabel}>Unavailable</Text>}
                </View>
              ))}
            </View>
          )}
        </View>

        {!showCodeFallback ? (
          <Pressable accessibilityRole="button" onPress={() => { void playSelectionHaptic(); setShowCodeFallback(true); }} style={styles.codeFallbackLink}>
            <Text style={styles.codeFallbackLinkText}>Or share your Kin code instead</Text>
          </Pressable>
        ) : (
          <>
            {myCode && (
              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>YOUR CODE</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{myCode}</Text>
                  <Pressable accessibilityHint="Shares your code" accessibilityRole="button" hitSlop={8} onPress={() => void shareMyCode()} style={styles.shareCodeButton}>
                    <Feather color={theme.colors.crimsonBright} name="share" size={16} />
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.sheetSection}>
              <Text style={styles.sheetLabel}>OR ENTER THEIR CODE</Text>
              <TextInputV2
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setCodeInput}
                placeholder="ABCD1234"
                placeholderTextColor={theme.colors.warmGrey}
                style={styles.codeInput}
                value={codeInput}
              />
              {redeemFeedback && <Text style={styles.sheetFeedback}>{redeemFeedback}</Text>}
            </View>

            <PrimaryButtonV2
              accessibilityHint="Sends a Kin request to that code's owner"
              disabled={codeInput.trim().length === 0}
              label="Send request"
              onPress={() => void submitCode()}
              reducedMotion={reducedMotion}
            />
          </>
        )}
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setManageTarget(null)} reducedMotion={reducedMotion} visible={manageTarget !== null}>
        {manageTarget && (
          <>
            <Text style={styles.sheetTitle}>{manageTarget.otherDisplayName}</Text>
            <Pressable accessibilityRole="button" onPress={() => confirmRemove(manageTarget)} style={styles.sheetAction}>
              <Text style={styles.sheetActionLabel}>Remove Kin</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => openReport({ userId: manageTarget.otherUserId, displayName: manageTarget.otherDisplayName, activityId: null })}
              style={styles.sheetAction}
            >
              <Text style={styles.sheetActionLabel}>Report</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => confirmBlock(manageTarget)} style={styles.sheetAction}>
              <Text style={[styles.sheetActionLabel, styles.sheetActionDestructive]}>Block</Text>
            </Pressable>
          </>
        )}
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setReportTarget(null)} reducedMotion={reducedMotion} visible={reportTarget !== null}>
        {reportTarget && (
          <>
            <Text style={styles.sheetTitle}>Report {reportTarget.displayName}</Text>
            <Text style={styles.sheetFeedback}>Why are you reporting this?</Text>
            {REPORT_REASONS.map((reason) => (
              <Pressable
                accessibilityRole="button"
                disabled={submittingReport}
                key={reason}
                onPress={() => void submitReport(reason)}
                style={styles.sheetAction}
              >
                <Text style={styles.sheetActionLabel}>{REPORT_REASON_LABELS[reason]}</Text>
              </Pressable>
            ))}
          </>
        )}
      </BottomSheetV2>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.small, gap: theme.spacing.xsmall,
  },
  header: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  addAction: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
  },
  addActionPressed: { backgroundColor: theme.colors.surfaceRaised },
  segmented: { marginTop: 4 },
  loadingBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { marginTop: theme.spacing.small, gap: theme.spacing.small, paddingBottom: theme.spacing.large },
  emptyBody: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 12 },
  emptyTitle: { color: theme.colors.ivory, fontSize: 16, fontWeight: '700' },
  emptyText: { color: theme.colors.ivoryMuted, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  requestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.small,
  },
  requestCopy: { flex: 1 },
  requestName: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  requestSubtext: { color: theme.colors.ivoryMuted, fontSize: 12 },
  requestActions: { flexDirection: 'row', gap: 8 },
  requestButton: {
    minHeight: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.precise, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
  },
  requestButtonPrimary: { borderColor: theme.colors.rosewood, backgroundColor: theme.colors.rosewood },
  requestButtonPressed: { opacity: 0.8 },
  requestButtonLabel: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '700' },
  requestButtonPrimaryLabel: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700' },
  activityCard: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.small, gap: 8,
  },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityCopy: { flex: 1 },
  activityName: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  activityBehavior: { color: theme.colors.ivoryMuted, fontSize: 12 },
  activityTime: { color: theme.colors.warmGrey, fontSize: 11 },
  reportButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  activityEvent: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  activityEventFailure: { color: theme.colors.crimsonBright },
  activityEventSuccess: { color: theme.colors.sage },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reactionChip: {
    minHeight: 30, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.precise, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised,
  },
  reactionChipActive: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  reactionChipPressed: { opacity: 0.75 },
  reactionLabel: { color: theme.colors.ivoryMuted, fontSize: 11, fontWeight: '700' },
  reactionLabelActive: { color: theme.colors.crimsonBright },
  rowGroup: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  personRow: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  personRowPressed: { backgroundColor: theme.colors.surfaceRaised },
  personName: { flex: 1, color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  pendingTag: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '700' },
  cancelRequestButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addKinButton: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.crimson,
    backgroundColor: theme.colors.crimsonSurface,
  },
  addKinButtonPressed: { opacity: 0.85 },
  addKinLabel: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
  sheetTitle: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700' },
  sheetSection: { gap: 8 },
  sheetLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, minHeight: 48,
  },
  codeText: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700', letterSpacing: 3 },
  shareCodeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  codeInput: {
    color: theme.colors.ivory, fontSize: 16, fontWeight: '700', letterSpacing: 2,
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, minHeight: 48,
  },
  sheetFeedback: { color: theme.colors.ivoryMuted, fontSize: 12 },
  sheetAction: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: theme.colors.structureLine },
  sheetActionLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  sheetActionDestructive: { color: theme.colors.crimsonBright },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 6 },
  currentlySection: { gap: 4 },
  emptyEventsText: { color: theme.colors.warmGrey, fontSize: 12 },
  currentRow: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  currentRowCopy: { flex: 1 },
  currentRowName: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700' },
  currentRowBehavior: { color: theme.colors.ivoryMuted, fontSize: 12 },
  searchInput: {
    color: theme.colors.ivory, fontSize: 15, fontWeight: '600',
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, minHeight: 48, marginBottom: 8,
  },
  searchLoadingRow: { alignItems: 'flex-start', paddingVertical: 4 },
  searchResultRow: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  searchResultName: { flex: 1, color: theme.colors.ivory, fontSize: 14, fontWeight: '600' },
  searchAddButton: {
    minHeight: 32, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.precise, backgroundColor: theme.colors.rosewood,
  },
  searchAddButtonPressed: { opacity: 0.85 },
  searchAddButtonLabel: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700' },
  searchStateLabel: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '600' },
  codeFallbackLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  codeFallbackLinkText: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
