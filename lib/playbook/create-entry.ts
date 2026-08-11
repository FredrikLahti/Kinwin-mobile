import type { PlaybookCategory } from '@/lib/supabase/playbook-repository';

export type PlaybookCreateInput = {
  readonly ownerId: string;
  readonly category: PlaybookCategory;
  readonly content: string;
  readonly sourceChallengeId: string | null;
};

export function buildPlaybookCreateInput(input: {
  readonly ownerId: string;
  readonly category: PlaybookCategory;
  readonly content: string;
  readonly sourceChallengeId?: string;
}): PlaybookCreateInput {
  return { ownerId: input.ownerId, category: input.category, content: input.content, sourceChallengeId: input.sourceChallengeId || null };
}
