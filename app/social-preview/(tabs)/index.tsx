import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { ReactionBar } from '@/components/social/reaction-bar';
import { kinwinTheme as theme } from '@/constants/theme';
import { SocialChallengeId, SocialEvent, SocialEventKind, SocialFeedStory } from '@/domain/social/types';
import { SOCIAL_FEED_ITEMS } from '@/fixtures/social/events';
import { playSelectionHaptic } from '@/lib/haptics';

const EVENT_LABELS: Record<SocialEventKind, string> = {
  challenge_started: 'STARTED A CHALLENGE',
  milestone_reached: 'MILESTONE',
  missed_commitment: 'MISSED A COMMITMENT',
  consequence_activated: 'CONSEQUENCE ACTIVATED',
  consequence_completed: 'CONSEQUENCE DELIVERED',
  challenge_succeeded: 'COMPLETED THE CHALLENGE',
};

export default function KinFeedScreen() {
  const router = useRouter();

  const openRoom = (challengeId: SocialChallengeId) => {
    void playSelectionHaptic();
    router.push({
      pathname: '/social-preview/challenge-room',
      params: { challengeId },
    } as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <PrototypeTag />
          <Text accessibilityRole="header" style={styles.title}>Kin feed</Text>
          <Text style={styles.subtitle}>What your Kin are actually going through — not daily check-ins.</Text>
        </View>

        {SOCIAL_FEED_ITEMS.map((item) =>
          item.kind === 'story' ? (
            <StoryCard item={item} key={item.id} onOpenRoom={() => openRoom(item.challengeId)} />
          ) : (
            <EventCard item={item} key={item.id} onOpenRoom={() => openRoom(item.challengeId)} />
          ),
        )}

        <Text style={styles.endOfFeed}>That&apos;s everything from your Kin right now.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function EventCard({ item, onOpenRoom }: { item: SocialEvent; onOpenRoom: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <KinAvatar initials={item.actorInitials} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.actor}>{item.actorDisplayName}</Text>
          <Text style={styles.eventLabel}>{EVENT_LABELS[item.kind]} · {item.timeLabel}</Text>
        </View>
      </View>

      <Text style={styles.headline}>{item.headline}</Text>

      <RoomLink detail={item.detail} onPress={onOpenRoom} />
      <ReactionBar contextLabel={`${item.actorDisplayName}'s update`} initialReactions={item.reactions} />
    </View>
  );
}

function StoryCard({ item, onOpenRoom }: { item: SocialFeedStory; onOpenRoom: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <KinAvatar initials={item.actorInitials} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.actor}>{item.actorDisplayName}</Text>
          <Text style={styles.eventLabel}>STORY · {item.timeLabel}</Text>
        </View>
      </View>

      <Text style={styles.headline}>{item.headline}</Text>

      <View style={styles.storyMoments}>
        {item.moments.map((moment, index) => (
          <View key={moment.label + index} style={styles.storyMomentRow}>
            <Text style={styles.storyMomentLabel}>{moment.label}</Text>
            <Text style={styles.storyMomentText}>{moment.text}</Text>
          </View>
        ))}
      </View>

      <RoomLink detail={item.detail} onPress={onOpenRoom} />
      <ReactionBar contextLabel={`${item.actorDisplayName}'s story`} initialReactions={item.reactions} />
    </View>
  );
}

function RoomLink({ detail, onPress }: { detail: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint={`Opens the Challenge Room for ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.roomLink, pressed && styles.roomLinkPressed]}
    >
      <Text style={styles.roomLinkText}>{detail}</Text>
      <Text aria-hidden style={styles.roomLinkArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 8, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 28, lineHeight: 34, marginTop: 4,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  card: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 10,
    borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 22, paddingVertical: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeaderText: { flex: 1 },
  actor: { color: theme.colors.bone, fontSize: 14, fontWeight: '700' },
  eventLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
  headline: { color: theme.colors.bone, fontSize: 15, lineHeight: 21 },
  storyMoments: {
    gap: 6,
    borderLeftWidth: 2, borderLeftColor: theme.colors.structureLineStrong,
    paddingLeft: 12,
  },
  storyMomentRow: { flexDirection: 'row', gap: 8 },
  storyMomentLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '700', width: 44 },
  storyMomentText: { flex: 1, color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 18 },
  roomLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12,
  },
  roomLinkPressed: { borderColor: theme.colors.copper, backgroundColor: theme.colors.surfaceFocused },
  roomLinkText: { flex: 1, color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '600' },
  roomLinkArrow: { color: theme.colors.copperBright, fontSize: 15 },
  endOfFeed: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    color: theme.colors.warmGrey, fontSize: 12, textAlign: 'center',
    paddingTop: 20, paddingHorizontal: 22,
  },
});
