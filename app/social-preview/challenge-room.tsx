import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KinAvatar } from '@/components/social/kin-avatar';
import { OverflowMenu } from '@/components/social/overflow-menu';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { ReactionBar } from '@/components/social/reaction-bar';
import { kinwinTheme as theme } from '@/constants/theme';
import { SocialChallengeId, SocialChallengeProjection, SocialComment, SocialCommentId } from '@/domain/social/types';
import { CHALLENGE_PROJECTIONS, findChallengeProjection } from '@/fixtures/social/challenge-projections';
import { SEED_COMMENTS } from '@/fixtures/social/comments';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const FALLBACK_CHALLENGE_ID = CHALLENGE_PROJECTIONS[0]?.challengeId;

export default function ChallengeRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = (params.challengeId ?? FALLBACK_CHALLENGE_ID) as SocialChallengeId;
  const projection = findChallengeProjection(challengeId);

  if (!projection) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>This Challenge Room isn&apos;t part of the prototype.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Keyed by challengeId so this screen's local state (comments, mute,
  // draft) always re-derives for a different challenge, even if a future
  // in-app navigation path were to change the param on an already-mounted
  // instance instead of pushing a fresh one.
  return <ChallengeRoomBody key={projection.challengeId} onBack={() => router.back()} projection={projection} />;
}

function ChallengeRoomBody({
  onBack,
  projection,
}: {
  onBack: () => void;
  projection: SocialChallengeProjection;
}) {
  const [muted, setMuted] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [comments, setComments] = useState<readonly SocialComment[]>(SEED_COMMENTS[projection.challengeId] ?? []);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const postComment = (body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    void playImportantHaptic();
    setComments((current) => [
      ...current,
      {
        id: `local-comment-${current.length}-${Date.now()}` as SocialCommentId,
        authorDisplayName: 'You',
        authorInitials: 'Y',
        timeLabel: 'Just now',
        body: trimmed,
        reactions: {},
        replies: [],
      },
    ]);
  };

  const addReply = (commentId: SocialCommentId, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    void playImportantHaptic();
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              replies: [
                ...comment.replies,
                {
                  id: `local-reply-${comment.replies.length}-${Date.now()}` as SocialCommentId,
                  authorDisplayName: 'You',
                  authorInitials: 'Y',
                  timeLabel: 'Just now',
                  body: trimmed,
                  reactions: {},
                },
              ],
            }
          : comment,
      ),
    );
  };

  const overflowActions = [
    {
      key: 'mute',
      label: muted ? 'Unmute notifications from this room' : 'Mute notifications from this room',
      hint: 'Toggles notifications for this Challenge Room only',
      onSelect: () => {
        void playSelectionHaptic();
        setMuted((current) => !current);
        setStatusNote(muted ? 'Notifications unmuted for this room.' : 'Notifications muted for this room.');
      },
    },
    {
      key: 'report',
      label: 'Report this challenge',
      hint: 'Flags this Challenge Room for review',
      destructive: true,
      onSelect: () => {
        void playImportantHaptic();
        setStatusNote('Reported. This is a prototype — nothing was sent.');
      },
    },
    {
      key: 'block',
      label: `Block ${projection.ownerDisplayName}`,
      hint: `Blocks ${projection.ownerDisplayName} and removes them from My Kin`,
      destructive: true,
      onSelect: () => {
        void playImportantHaptic();
        setStatusNote(`${projection.ownerDisplayName} would be blocked and removed from My Kin. Nothing changed — this is a prototype.`);
      },
    },
  ];

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the previous screen"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <PrototypeTag />
          <OverflowMenu accessibilityLabel="Challenge Room options" actions={overflowActions} />
        </View>

        {statusNote && (
          <View style={styles.statusNote}>
            <Text style={styles.statusNoteText}>{statusNote}</Text>
          </View>
        )}

        <View style={styles.ownerRow}>
          <KinAvatar initials={projection.ownerDisplayName.slice(0, 2).toUpperCase()} />
          <Text style={styles.ownerText}>{projection.ownerDisplayName}&apos;s Challenge Room{muted ? ' · muted' : ''}</Text>
        </View>

        <Text accessibilityRole="header" style={styles.title}>{projection.title}</Text>
        <Text style={styles.description}>{projection.description}</Text>

        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{projection.startedLabel}</Text>
          <Text style={styles.dateSeparator}>→</Text>
          <Text style={styles.dateText}>{projection.plannedEndLabel}</Text>
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(projection.progressRatio * 100)}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{projection.progressLabel}</Text>
        </View>

        {projection.consequenceSummary && (
          <View style={styles.consequenceCard}>
            <Text style={styles.consequenceLabel}>CONSEQUENCE</Text>
            <Text style={styles.consequenceText}>{projection.consequenceSummary}</Text>
            {projection.recipientNames && projection.recipientNames.length > 0 && (
              <Text style={styles.recipientText}>For: {projection.recipientNames.join(', ')}</Text>
            )}
          </View>
        )}

        <View style={styles.commentsSection}>
          <Text style={styles.sectionLabel}>COMMENTS ({comments.length})</Text>
          {comments.length === 0 && (
            <Text style={styles.emptyComments}>No comments yet. Be the first to say something.</Text>
          )}
          {comments.map((comment) => (
            <CommentRow comment={comment} key={comment.id} onReply={(body) => addReply(comment.id, body)} />
          ))}
          <AddCommentAction onPost={postComment} />
        </View>

        <HistorySection
          expanded={historyExpanded}
          lifecycle={projection.lifecycle}
          onToggle={() => { void playSelectionHaptic(); setHistoryExpanded((current) => !current); }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Collapsed by default: a low-emphasis "Add a comment" action rather than a
 * permanently fixed composer, so the room doesn't visually read as a
 * messaging app (docs/SOCIAL_UX_V1.md section 2). Tapping it reveals and
 * focuses a text field; Cancel collapses it again without posting.
 */
function AddCommentAction({ onPost }: { onPost: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Pressable
        accessibilityHint="Reveals a text field to add a comment"
        accessibilityRole="button"
        onPress={() => { void playSelectionHaptic(); setOpen(true); }}
        style={({ pressed }) => [styles.addCommentAction, pressed && styles.addCommentActionPressed]}
      >
        <Text style={styles.addCommentActionText}>+ Add a comment</Text>
      </Pressable>
    );
  }

  const cancel = () => {
    setText('');
    setOpen(false);
  };

  const submit = () => {
    if (!text.trim()) return;
    onPost(text);
    setText('');
    setOpen(false);
  };

  return (
    <View style={styles.addCommentComposer}>
      <TextInput
        accessibilityLabel="Write a comment"
        multiline
        onChangeText={setText}
        placeholder="Say something…"
        placeholderTextColor={theme.colors.warmGrey}
        ref={inputRef}
        style={styles.composerInput}
        value={text}
      />
      <View style={styles.addCommentActions}>
        <Pressable
          accessibilityHint="Closes the comment field without posting"
          accessibilityRole="button"
          onPress={cancel}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Posts your comment to this session only"
          accessibilityLabel="Post comment"
          accessibilityRole="button"
          disabled={text.trim().length === 0}
          onPress={submit}
          style={({ pressed }) => [
            styles.postButton,
            text.trim().length === 0 && styles.postButtonDisabled,
            pressed && styles.postButtonPressed,
          ]}
        >
          <Text style={styles.postButtonText}>Post</Text>
        </Pressable>
      </View>
    </View>
  );
}

const COLLAPSED_HISTORY_COUNT = 2;

function HistorySection({
  expanded,
  lifecycle,
  onToggle,
}: {
  expanded: boolean;
  lifecycle: SocialChallengeProjection['lifecycle'];
  onToggle: () => void;
}) {
  const hiddenCount = Math.max(0, lifecycle.length - COLLAPSED_HISTORY_COUNT);
  const visible = expanded || hiddenCount === 0 ? lifecycle : lifecycle.slice(-COLLAPSED_HISTORY_COUNT);

  return (
    <View style={styles.timeline}>
      <Text style={styles.sectionLabel}>WHAT&apos;S HAPPENED</Text>
      {visible.map((event, index) => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timelineMarkerColumn}>
            <View style={styles.timelineDot} />
            {index < visible.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={styles.timelineTextColumn}>
            <Text style={styles.timelineDay}>{event.dayLabel}</Text>
            <Text style={styles.timelineHeadline}>{event.headline}</Text>
          </View>
        </View>
      ))}
      {hiddenCount > 0 && (
        <Pressable
          accessibilityHint={expanded ? 'Shows only the most recent history' : 'Shows the full history for this challenge'}
          accessibilityRole="button"
          onPress={onToggle}
          style={styles.historyToggle}
        >
          <Text style={styles.historyToggleText}>
            {expanded ? 'Show less' : `View full history (${hiddenCount} more)`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CommentRow({ comment, onReply }: { comment: SocialComment; onReply: (body: string) => void }) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');

  return (
    <View style={styles.comment}>
      <KinAvatar initials={comment.authorInitials} size={32} />
      <View style={styles.commentBody}>
        <Text style={styles.commentAuthor}>{comment.authorDisplayName} <Text style={styles.commentTime}>· {comment.timeLabel}</Text></Text>
        <Text style={styles.commentText}>{comment.body}</Text>
        <View style={styles.commentActions}>
          <ReactionBar contextLabel={`${comment.authorDisplayName}'s comment`} initialReactions={comment.reactions} />
          <Pressable
            accessibilityHint={`Replies to ${comment.authorDisplayName}'s comment`}
            accessibilityRole="button"
            onPress={() => setReplying((current) => !current)}
            style={styles.replyToggle}
          >
            <Text style={styles.replyToggleText}>Reply</Text>
          </Pressable>
        </View>

        {comment.replies.map((reply) => (
          <View key={reply.id} style={styles.reply}>
            <KinAvatar initials={reply.authorInitials} size={26} />
            <View style={styles.replyBody}>
              <Text style={styles.commentAuthor}>{reply.authorDisplayName} <Text style={styles.commentTime}>· {reply.timeLabel}</Text></Text>
              <Text style={styles.commentText}>{reply.body}</Text>
            </View>
          </View>
        ))}

        {replying && (
          <View style={styles.replyComposer}>
            <TextInput
              accessibilityLabel={`Reply to ${comment.authorDisplayName}`}
              onChangeText={setReplyText}
              placeholder={`Reply to ${comment.authorDisplayName}…`}
              placeholderTextColor={theme.colors.warmGrey}
              style={styles.replyInput}
              value={replyText}
            />
            <Pressable
              accessibilityHint="Posts your reply to this session only"
              accessibilityRole="button"
              onPress={() => { onReply(replyText); setReplyText(''); setReplying(false); }}
              style={styles.replyPostButton}
            >
              <Text style={styles.replyPostButtonText}>Reply</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { paddingBottom: 24 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  notFoundText: { color: theme.colors.boneMuted, fontSize: 14, textAlign: 'center' },
  backLink: { minHeight: 44, justifyContent: 'center' },
  backLinkText: { color: theme.colors.copperBright, fontWeight: '700' },
  header: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 6,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  statusNote: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    marginHorizontal: 22, marginTop: 6,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10,
  },
  statusNoteText: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 17 },
  ownerRow: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingTop: 16,
  },
  ownerText: { color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '700' },
  title: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 26, lineHeight: 32,
    paddingHorizontal: 22, paddingTop: 12,
  },
  description: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21,
    paddingHorizontal: 22, paddingTop: 8,
  },
  dateRow: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingTop: 14,
  },
  dateText: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '600' },
  dateSeparator: { color: theme.colors.structureLineStrong, fontSize: 12 },
  progressBlock: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 8, paddingHorizontal: 22, paddingTop: 14,
  },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.structureLine, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.colors.copperBright },
  progressLabel: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  consequenceCard: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 6, marginHorizontal: 22, marginTop: 18,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 14,
  },
  consequenceLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  consequenceText: { color: theme.colors.bone, fontSize: 13.5, lineHeight: 20 },
  recipientText: { color: theme.colors.boneMuted, fontSize: 12, fontWeight: '600' },
  timeline: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 4, borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 22, paddingTop: 20, marginTop: 20,
  },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineMarkerColumn: { alignItems: 'center', width: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  timelineLine: { width: 1, flex: 1, minHeight: 22, backgroundColor: theme.colors.structureLineStrong },
  timelineTextColumn: { flex: 1, paddingBottom: 16 },
  timelineDay: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  timelineHeadline: { color: theme.colors.bone, fontSize: 13.5, lineHeight: 20, marginTop: 2 },
  historyToggle: { minHeight: 40, justifyContent: 'center' },
  historyToggleText: { color: theme.colors.copperBright, fontSize: 12.5, fontWeight: '700' },
  commentsSection: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 16, borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 22, paddingTop: 20,
  },
  emptyComments: { color: theme.colors.warmGrey, fontSize: 13, lineHeight: 19 },
  comment: { flexDirection: 'row', gap: 10 },
  commentBody: { flex: 1, gap: 4 },
  commentAuthor: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  commentTime: { color: theme.colors.warmGrey, fontWeight: '400' },
  commentText: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  replyToggle: { minHeight: 32, justifyContent: 'center' },
  replyToggleText: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700' },
  reply: { flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 8 },
  replyBody: { flex: 1, gap: 3 },
  replyComposer: { flexDirection: 'row', gap: 8, marginTop: 10 },
  replyInput: {
    flex: 1, minHeight: 38,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 10, color: theme.colors.bone, fontSize: 13,
  },
  replyPostButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12 },
  replyPostButtonText: { color: theme.colors.copperBright, fontSize: 12.5, fontWeight: '700' },
  addCommentAction: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  addCommentActionPressed: { opacity: 0.7 },
  addCommentActionText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700' },
  addCommentComposer: { gap: 10, marginTop: 4 },
  addCommentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  cancelButtonText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700' },
  composerInput: {
    minHeight: 40, maxHeight: 90,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 8,
    color: theme.colors.bone, fontSize: 14,
  },
  postButton: {
    minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.copperSurface, paddingHorizontal: 16,
  },
  postButtonDisabled: { borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface },
  postButtonPressed: { opacity: 0.85 },
  postButtonText: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
});
