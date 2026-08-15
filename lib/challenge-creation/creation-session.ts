import {
  BehaviorDirection,
  ExperienceCategory,
  MeasurementMode,
  RecipientDraft,
  RewardOrganizer,
  RhythmState,
} from '@/contexts/onboarding-context';

// A local, on-device snapshot of *unfinished* challenge creation — distinct
// from the complete, server-validated `challenge_drafts` row that
// domain/challenge/from-onboarding-draft.ts's mapOnboardingDraft guards.
// This module never validates the shape into a real ChallengeDraft; it only
// remembers enough raw onboarding fields to restore the creation flow to
// where the user left off. Storage I/O is injected (see
// CreationSessionStorage) so this file has no React Native dependency and
// can be unit tested directly.
export type CreationSessionFields = {
  readonly behaviorDirection: BehaviorDirection | null;
  readonly behaviorText: string;
  readonly definitionText: string;
  readonly durationWeeks: number | null;
  readonly experienceCategory: ExperienceCategory | null;
  readonly goal: string;
  readonly invitationMessage: string;
  readonly invitationMessageCustomized: boolean;
  readonly membershipChoice: 'monthly_trial' | null;
  readonly measurementMode: MeasurementMode | null;
  readonly recipients: readonly RecipientDraft[];
  readonly rewardOrganizer: RewardOrganizer;
  readonly rhythm: RhythmState;
  readonly sitOutAcknowledged: boolean;
  readonly stakeAmount: number | null;
  readonly stakeAmountInput: string;
};

export const CREATION_SESSION_SCHEMA_VERSION = 1;

export type CreationSessionSnapshot = {
  readonly schemaVersion: typeof CREATION_SESSION_SCHEMA_VERSION;
  readonly updatedAt: string;
  /** The create/* route the user was last on, e.g. "/create/frequency". */
  readonly lastRoute: string;
  readonly fields: CreationSessionFields;
};

/** Every /create/* route a session can legitimately resume into — never intro (nothing entered yet) or share (already converted to a real server commitment). */
export const RESUMABLE_CREATION_ROUTES = [
  '/create/goal',
  '/create/type',
  '/create/build',
  '/create/frequency',
  '/create/limit',
  '/create/avoid',
  '/create/duration',
  '/create/recipients',
  '/create/consequence',
  '/create/review',
] as const;

const DEFAULT_RESUME_ROUTE = '/create/goal';

/** Falls back to the first real creation step if the stored route is missing, stale, or was never a valid one — never trusts a persisted string blindly. */
export function resolveResumeRoute(lastRoute: string): string {
  return (RESUMABLE_CREATION_ROUTES as readonly string[]).includes(lastRoute) ? lastRoute : DEFAULT_RESUME_ROUTE;
}

/**
 * True once the user has entered anything worth not losing. Mirrors
 * createInitialOnboardingFields()'s blank baseline field-by-field so the two
 * can never silently drift apart. Used both to decide whether autosave
 * should persist anything at all (E: no noisy permanent draft from an empty
 * visit) and whether Exit needs to confirm.
 */
export function hasMeaningfulCreationProgress(fields: CreationSessionFields): boolean {
  return (
    fields.goal.trim().length > 0 ||
    fields.behaviorText.trim().length > 0 ||
    fields.definitionText.trim().length > 0 ||
    fields.behaviorDirection !== null ||
    fields.measurementMode !== null ||
    fields.durationWeeks !== null ||
    fields.rhythm.type !== null ||
    fields.rhythm.targetValue.trim().length > 0 ||
    fields.rhythm.selectedWeekdays.length > 0 ||
    fields.rhythm.amountUnit.trim().length > 0 ||
    fields.recipients.some((recipient) => recipient.name.trim().length > 0) ||
    fields.rewardOrganizer !== null ||
    fields.experienceCategory !== null ||
    fields.stakeAmount !== null ||
    fields.stakeAmountInput.trim().length > 0 ||
    fields.sitOutAcknowledged ||
    fields.invitationMessageCustomized ||
    fields.membershipChoice !== null
  );
}

export type CreationSessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Isolates snapshots per authenticated user and per schema version — a signed-in user can never read another signed-in user's key, and a version bump can never misread an older shape. */
export function creationSessionStorageKey(userId: string): string {
  return `kinwin:creation-session:v${CREATION_SESSION_SCHEMA_VERSION}:${userId}`;
}

function isValidSnapshotShape(value: unknown): value is CreationSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CreationSessionSnapshot>;
  return (
    candidate.schemaVersion === CREATION_SESSION_SCHEMA_VERSION &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.lastRoute === 'string' &&
    typeof candidate.fields === 'object' &&
    candidate.fields !== null
  );
}

/** Returns null for "no session" and for corrupt/incompatible data alike — callers never need to distinguish the two. Corrupt data is proactively removed so it cannot linger and fail again later. */
export async function readCreationSession(
  userId: string,
  storage: CreationSessionStorage,
): Promise<CreationSessionSnapshot | null> {
  if (!userId) return null;
  const key = creationSessionStorageKey(userId);
  let raw: string | null;
  try {
    raw = await storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await storage.removeItem(key).catch(() => undefined);
    return null;
  }

  if (!isValidSnapshotShape(parsed)) {
    await storage.removeItem(key).catch(() => undefined);
    return null;
  }
  return parsed;
}

export async function writeCreationSession(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  storage: CreationSessionStorage,
): Promise<void> {
  if (!userId) return;
  const snapshot: CreationSessionSnapshot = {
    schemaVersion: CREATION_SESSION_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    lastRoute,
    fields,
  };
  await storage.setItem(creationSessionStorageKey(userId), JSON.stringify(snapshot));
}

export async function clearCreationSession(userId: string, storage: CreationSessionStorage): Promise<void> {
  if (!userId) return;
  await storage.removeItem(creationSessionStorageKey(userId));
}

export type CreateChallengeEntryAction = 'open_pending_commitment' | 'prompt_resume' | 'start_fresh';

/**
 * Decides what tapping "+ Create challenge" on Home should do. Pending
 * commitment always wins — it is a real, already-paid-toward server
 * obligation and there can only ever be one, so it must never be shadowed
 * by a competing local draft-resume prompt. A resumable local session only
 * matters once that is ruled out.
 */
export function decideCreateChallengeEntryAction(
  hasPendingCommitment: boolean,
  hasResumableSession: boolean,
): CreateChallengeEntryAction {
  if (hasPendingCommitment) return 'open_pending_commitment';
  if (hasResumableSession) return 'prompt_resume';
  return 'start_fresh';
}
