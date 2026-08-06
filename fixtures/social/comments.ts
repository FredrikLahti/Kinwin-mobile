import { SocialChallengeId, SocialComment, SocialCommentId } from '@/domain/social/types';

/**
 * Seed comments for the Challenge Room, keyed by challenge id. These are the
 * *initial* in-memory state only — the room composes new comments/replies
 * locally for the session and never writes back here, so a reload honestly
 * resets to this seed (docs/SOCIAL_V1_SPEC.md section 13).
 */
export const SEED_COMMENTS: Readonly<Record<SocialChallengeId, readonly SocialComment[]>> = {
  ['challenge-alex-sugar' as SocialChallengeId]: [
    {
      id: 'comment-1' as SocialCommentId,
      authorDisplayName: 'Priya',
      authorInitials: 'PK',
      timeLabel: '26d ago',
      body: "Proud of you for starting this. You've talked about it for months!",
      reactions: { strength: 2 },
      replies: [],
    },
    {
      id: 'comment-2' as SocialCommentId,
      authorDisplayName: 'Mia',
      authorInitials: 'MR',
      timeLabel: '13d ago',
      body: 'Halfway and no slips?? Who even are you right now',
      reactions: { laugh: 4, fire: 2 },
      replies: [
        {
          id: 'comment-2-reply-1' as SocialCommentId,
          authorDisplayName: 'Alex',
          authorInitials: 'AR',
          timeLabel: '13d ago',
          body: "Honestly surprised myself. Don't jinx it.",
          reactions: { laugh: 1 },
        },
      ],
    },
    {
      id: 'comment-3' as SocialCommentId,
      authorDisplayName: 'Jonas',
      authorInitials: 'JB',
      timeLabel: '5d ago',
      body: "A slip after 3 weeks is still a great run. Mom and I appreciate the spa day either way 😏",
      reactions: { laugh: 6, crown: 1 },
      replies: [],
    },
    {
      id: 'comment-4' as SocialCommentId,
      authorDisplayName: 'Mom',
      authorInitials: 'M',
      timeLabel: '2h ago',
      body: 'Best afternoon in ages. Thank you for keeping your word, sweetheart ❤️',
      reactions: { fire: 3 },
      replies: [],
    },
  ],
  ['challenge-priya-running' as SocialChallengeId]: [],
  ['challenge-mia-journaling' as SocialChallengeId]: [
    {
      id: 'comment-mia-1' as SocialCommentId,
      authorDisplayName: 'Priya',
      authorInitials: 'PK',
      timeLabel: '1h ago',
      body: 'Iconic. Genuinely proud of you. Also 😭 no dinner pick for me this month?',
      reactions: { crown: 3, laugh: 2 },
      replies: [
        {
          id: 'comment-mia-1-reply-1' as SocialCommentId,
          authorDisplayName: 'Mia',
          authorInitials: 'MR',
          timeLabel: '1h ago',
          body: "Sorry not sorry. Elin's choosing the restaurant tonight and I'm eating well.",
          reactions: { laugh: 3 },
        },
      ],
    },
    {
      id: 'comment-mia-2' as SocialCommentId,
      authorDisplayName: 'Jonas',
      authorInitials: 'JB',
      timeLabel: '45m ago',
      body: '21/21 is actually unreal. Kind of annoyed there was no drama for us to enjoy though 😂',
      reactions: { crown: 4, laugh: 5 },
      replies: [],
    },
  ],
};
