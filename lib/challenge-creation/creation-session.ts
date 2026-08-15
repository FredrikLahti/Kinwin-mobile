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

// Runtime-checked mirrors of the string-union types CreationSessionFields is
// built from — plain arrays, not a schema library, since these are the only
// two class of value (enum-ish strings, and the couple of nested object
// shapes below) that need real structural checking. A shallow "is this an
// object" check let a payload like `fields: {}` through as "valid," which
// then crashed real consumers (fields.rhythm.type, fields.recipients.some,
// etc.) instead of being treated as the corrupt data it actually is.
const BEHAVIOR_DIRECTIONS = ['build', 'cut', 'stop'];
const MEASUREMENT_MODES = ['completion', 'count', 'time', 'amount', 'abstinence'];
const EXPERIENCE_CATEGORIES = ['dinner', 'wellness', 'adventure', 'culture', 'getaway'];
const RHYTHM_TYPES = ['daily', 'weekly_count', 'specific_days', 'maximum_per_period', 'continuous'];
const RHYTHM_PERIODS = ['day', 'week'];
const RHYTHM_TIME_UNITS = ['minutes', 'hours'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function isNullableEnum(value: unknown, allowed: readonly string[]): boolean {
  return value === null || (typeof value === 'string' && allowed.includes(value));
}

function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isValidRhythm(value: unknown): value is RhythmState {
  if (!value || typeof value !== 'object') return false;
  const rhythm = value as Record<string, unknown>;
  return (
    typeof rhythm.amountUnit === 'string' &&
    isNullableEnum(rhythm.period, RHYTHM_PERIODS) &&
    Array.isArray(rhythm.selectedWeekdays) &&
    rhythm.selectedWeekdays.every((day) => typeof day === 'string' && WEEKDAYS.includes(day)) &&
    typeof rhythm.targetValue === 'string' &&
    isNullableEnum(rhythm.timeUnit, RHYTHM_TIME_UNITS) &&
    isNullableEnum(rhythm.type, RHYTHM_TYPES)
  );
}

function isValidRecipients(value: unknown): value is readonly RecipientDraft[] {
  return (
    Array.isArray(value) &&
    value.every(
      (recipient) =>
        recipient !== null &&
        typeof recipient === 'object' &&
        typeof (recipient as Record<string, unknown>).id === 'string' &&
        ((recipient as Record<string, unknown>).id as string).length > 0 &&
        typeof (recipient as Record<string, unknown>).name === 'string',
    )
  );
}

function isValidRewardOrganizer(value: unknown): value is RewardOrganizer {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const organizer = value as Record<string, unknown>;
  if (organizer.type === 'recipient') return typeof organizer.recipientId === 'string' && organizer.recipientId.length > 0;
  if (organizer.type === 'other') return typeof organizer.name === 'string';
  return false;
}

function isValidCreationSessionFields(value: unknown): value is CreationSessionFields {
  if (!value || typeof value !== 'object') return false;
  const fields = value as Record<string, unknown>;
  return (
    isNullableEnum(fields.behaviorDirection, BEHAVIOR_DIRECTIONS) &&
    typeof fields.behaviorText === 'string' &&
    typeof fields.definitionText === 'string' &&
    isFiniteNumberOrNull(fields.durationWeeks) &&
    isNullableEnum(fields.experienceCategory, EXPERIENCE_CATEGORIES) &&
    typeof fields.goal === 'string' &&
    typeof fields.invitationMessage === 'string' &&
    typeof fields.invitationMessageCustomized === 'boolean' &&
    (fields.membershipChoice === null || fields.membershipChoice === 'monthly_trial') &&
    isNullableEnum(fields.measurementMode, MEASUREMENT_MODES) &&
    isValidRecipients(fields.recipients) &&
    isValidRewardOrganizer(fields.rewardOrganizer) &&
    isValidRhythm(fields.rhythm) &&
    typeof fields.sitOutAcknowledged === 'boolean' &&
    isFiniteNumberOrNull(fields.stakeAmount) &&
    typeof fields.stakeAmountInput === 'string'
  );
}

function isValidSnapshotShape(value: unknown): value is CreationSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CreationSessionSnapshot>;
  return (
    candidate.schemaVersion === CREATION_SESSION_SCHEMA_VERSION &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.lastRoute === 'string' &&
    isValidCreationSessionFields(candidate.fields)
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

// A generation is bumped exactly when a user's creation lifecycle closes —
// server conversion (prepareChallengeFromDraft succeeds) or explicit
// discard. The mutation queue below correctly orders a write that has
// *already* reached it before a subsequent clear, but it cannot help with
// a debounced autosave timer that is still waiting to fire: that write has
// not called writeCreationSession yet, so it is not in the queue at all
// when the lifecycle closes, and could otherwise land well after the
// clear that was supposed to be final. A write captures the generation
// that was current when it was *scheduled* (e.g. the instant autosave
// arms its debounce timer), not when it finally runs; if that generation
// has since moved on by the time the write reaches the front of the
// queue, it is recognized as belonging to an already-abandoned lifecycle
// and silently skipped — never a failure, just no longer applicable. This
// holds regardless of queue position or timer/unmount timing, which is
// exactly what a debounce-window race needs.
const creationSessionGenerations = new Map<string, number>();

/** The generation currently active for a user's creation session. Capture this at the moment a write is scheduled, not when it finally executes. */
export function currentCreationSessionGeneration(userId: string): number {
  return creationSessionGenerations.get(userId) ?? 0;
}

/**
 * Closes out a user's current creation-session generation. Call this at
 * the server-conversion boundary and on explicit discard, before clearing
 * the persisted snapshot — any write already captured under the
 * now-stale generation becomes a permanent no-op the moment it reaches
 * the mutation queue, no matter how long after this call its underlying
 * timer eventually fires. Returns the new generation, which a
 * subsequently-started fresh creation flow captures and writes under
 * normally.
 */
export function closeCreationSessionGeneration(userId: string): number {
  const next = currentCreationSessionGeneration(userId) + 1;
  creationSessionGenerations.set(userId, next);
  return next;
}

// Serializes every write and clear for one user's creation session through
// the same ordered queue, keyed by user id. Without this, a slow
// background autosave `setItem` already in flight when creation converts
// into a real server commitment could finish *after* the clear that marks
// that conversion, silently resurrecting a stale resumable snapshot. A
// promise chain per key is the smallest mechanism that gives this
// guarantee: each new mutation for a user is appended after whatever is
// already queued for that same user, and always runs (even if the mutation
// ahead of it failed) so one failure can never jam the queue forever.
// Mutations for different users are independent — completely separate map
// entries, never waiting on each other. Reads are deliberately not queued:
// they are naturally eventually-consistent, and this mechanism exists
// specifically to order writes/clears, not reads.
const creationSessionMutationQueues = new Map<string, Promise<unknown>>();

function enqueueCreationSessionMutation<T>(userId: string, mutation: () => Promise<T>): Promise<T> {
  const queuedAfter = creationSessionMutationQueues.get(userId) ?? Promise.resolve();
  const result = queuedAfter.then(mutation, mutation);
  creationSessionMutationQueues.set(
    userId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/**
 * Returns whether the write actually succeeded — callers that only promise
 * "saved" as a side note (autosave's own debounced background writes) can
 * ignore it, but hooks/use-creation-session-autosave.ts's flush() must not:
 * an explicit Exit that tells the user their progress is saved needs to
 * know the write really landed before it says so. `generation` must be
 * whatever currentCreationSessionGeneration(userId) returned at the moment
 * this write was scheduled — see the block comment above
 * creationSessionGenerations for why this is what actually closes the
 * debounce-window race a queue position alone cannot.
 */
export async function writeCreationSession(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  storage: CreationSessionStorage,
  generation: number,
): Promise<boolean> {
  if (!userId) return true;
  return enqueueCreationSessionMutation(userId, async () => {
    if (generation !== currentCreationSessionGeneration(userId)) {
      // This write belongs to a creation lifecycle that has since been
      // closed (converted or discarded) — not a failure, just no longer
      // applicable. Actually writing it now would resurrect a session
      // that is supposed to stay gone.
      return true;
    }
    const snapshot: CreationSessionSnapshot = {
      schemaVersion: CREATION_SESSION_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      lastRoute,
      fields,
    };
    try {
      await storage.setItem(creationSessionStorageKey(userId), JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  });
}

/** Returns whether the clear actually succeeded, for the same reason writeCreationSession does — callers at a real conversion boundary must handle a failure deliberately rather than fire-and-forget it. */
export async function clearCreationSession(userId: string, storage: CreationSessionStorage): Promise<boolean> {
  if (!userId) return true;
  return enqueueCreationSessionMutation(userId, async () => {
    try {
      await storage.removeItem(creationSessionStorageKey(userId));
      return true;
    } catch {
      return false;
    }
  });
}

export type LatestRequestGuard = {
  /** Call once per new request; returns a token identifying it. */
  readonly start: () => number;
  /** True only for the token belonging to the most recently started request — every earlier token becomes stale the instant a newer one starts. */
  readonly isCurrent: (token: number) => boolean;
};

/**
 * A tiny "last request wins" concurrency guard, extracted as a pure,
 * directly testable unit so hooks/use-resumable-creation-session.ts's
 * user-switch race fix doesn't need any React/async test infrastructure to
 * cover: without it, a slow read started for user A could resolve after
 * auth has already moved to user B and overwrite B's state with A's data.
 */
export function createLatestRequestGuard(): LatestRequestGuard {
  let current = 0;
  return {
    start: () => {
      current += 1;
      return current;
    },
    isCurrent: (token) => token === current,
  };
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

export type ExitAttemptPlan = 'leave_immediately' | 'confirm_unsaved_signed_out' | 'attempt_save';

/**
 * What components/v2/create-flow-screen.tsx's Close button should do next,
 * decided *before* any save is attempted. Autosave only ever persists for a
 * signed-in user (see hooks/use-creation-session-autosave.ts), so a
 * signed-out user with meaningful progress must never be told a save
 * happened — this exists specifically so that case gets its own honest
 * "leave without saving" confirmation instead of silently falling through
 * to the signed-in "your progress is saved" path.
 */
export function planExitAttempt(meaningfulProgress: boolean, isSignedIn: boolean): ExitAttemptPlan {
  if (!meaningfulProgress) return 'leave_immediately';
  if (!isSignedIn) return 'confirm_unsaved_signed_out';
  return 'attempt_save';
}
