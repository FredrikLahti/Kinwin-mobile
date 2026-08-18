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
  readonly successThresholdOverride: number | null;
};

// Bumped from 2: replaces the single savedForLater boolean with a real
// two-tier working/checkpoint split (see CreationSessionSnapshot below),
// which changes what it means for a snapshot to be valid (see
// isValidSnapshotShape) and therefore what counts as a compatible payload
// at all. Bumping this changes creationSessionStorageKey's output, so any
// snapshot written under an older version is simply never read under the
// new key — orphaned, not misinterpreted. That is the whole migration
// story: no in-place upgrade code, because there is nothing safe to
// upgrade an old payload *into* (a v2 payload's savedForLater: true was
// granted by background autosave preserving an earlier explicit save, not
// necessarily by the *latest* edit being explicitly saved — exactly the
// conflation this version fixes — so it must never be reinterpreted as a
// v3 checkpoint).
//
// Bumped from 3 to 4: CreationSessionFields gained successThresholdOverride
// (Success Means), an ADDITIVE field with a clear default (null — "use
// Kinwin's baseline", see domain/challenge/success-rule.ts). Unlike every
// earlier bump on this constant, a v3 payload here is not orphaned or
// discarded: readCreationSession explicitly migrates it forward (see
// migrateCreationSessionV3ToV4 below) rather than losing a legitimate
// in-progress Save & exit / crash-recovery session just because this one
// field was added. v3 is never written to again once migrated — only read
// and converted.
export const CREATION_SESSION_SCHEMA_VERSION = 4;
const LEGACY_V3_SCHEMA_VERSION = 3;

/**
 * Quiet crash-recovery state, overwritten by every background autosave
 * write — never surfaced to the user directly, and never what Continue
 * restores. Background autosave may freely update this; it must never
 * touch `checkpoint` below.
 */
export type CreationSessionWorking = {
  readonly fields: CreationSessionFields;
  readonly lastRoute: string;
  readonly updatedAt: string;
};

/**
 * The explicit resume point — set only by an explicit "Save & exit", never
 * by background autosave. This, and only this, is what "resume eligible"
 * means and what Continue restores: editing after Continue (or after a
 * fresh Save & exit) keeps `working` moving via autosave, but `checkpoint`
 * stays exactly what it was until the next explicit Save & exit
 * overwrites both together (see saveCreationSessionCheckpoint).
 */
export type CreationSessionCheckpoint = {
  readonly fields: CreationSessionFields;
  readonly lastRoute: string;
  readonly savedAt: string;
};

export type CreationSessionSnapshot = {
  readonly schemaVersion: typeof CREATION_SESSION_SCHEMA_VERSION;
  readonly working: CreationSessionWorking | null;
  readonly checkpoint: CreationSessionCheckpoint | null;
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
  '/create/success-means',
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
    fields.successThresholdOverride !== null ||
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
  return creationSessionStorageKeyForVersion(CREATION_SESSION_SCHEMA_VERSION, userId);
}

function creationSessionStorageKeyForVersion(version: number, userId: string): string {
  return `kinwin:creation-session:v${version}:${userId}`;
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
    typeof fields.stakeAmountInput === 'string' &&
    isFiniteNumberOrNull(fields.successThresholdOverride)
  );
}

function isValidCreationSessionWorking(value: unknown): value is CreationSessionWorking {
  if (!value || typeof value !== 'object') return false;
  const working = value as Record<string, unknown>;
  return (
    typeof working.lastRoute === 'string' &&
    typeof working.updatedAt === 'string' &&
    isValidCreationSessionFields(working.fields)
  );
}

function isValidCreationSessionCheckpoint(value: unknown): value is CreationSessionCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.lastRoute === 'string' &&
    typeof checkpoint.savedAt === 'string' &&
    isValidCreationSessionFields(checkpoint.fields)
  );
}

function isValidSnapshotShape(value: unknown): value is CreationSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CreationSessionSnapshot>;
  return (
    candidate.schemaVersion === CREATION_SESSION_SCHEMA_VERSION &&
    (candidate.working === null || isValidCreationSessionWorking(candidate.working)) &&
    (candidate.checkpoint === null || isValidCreationSessionCheckpoint(candidate.checkpoint))
  );
}

/**
 * v3's CreationSessionFields shape — every field v4 has, except
 * successThresholdOverride (which did not exist yet). Structural
 * sub-validators (isValidRhythm, isValidRecipients, etc.) are shared with
 * v4 unchanged, since none of those fields changed shape; only the
 * successThresholdOverride check is intentionally absent here.
 */
type CreationSessionFieldsV3 = Omit<CreationSessionFields, 'successThresholdOverride'>;

function isValidCreationSessionFieldsV3(value: unknown): value is CreationSessionFieldsV3 {
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

type CreationSessionWorkingV3 = { readonly fields: CreationSessionFieldsV3; readonly lastRoute: string; readonly updatedAt: string };
type CreationSessionCheckpointV3 = { readonly fields: CreationSessionFieldsV3; readonly lastRoute: string; readonly savedAt: string };
type CreationSessionSnapshotV3 = {
  readonly schemaVersion: typeof LEGACY_V3_SCHEMA_VERSION;
  readonly working: CreationSessionWorkingV3 | null;
  readonly checkpoint: CreationSessionCheckpointV3 | null;
};

function isValidCreationSessionWorkingV3(value: unknown): value is CreationSessionWorkingV3 {
  if (!value || typeof value !== 'object') return false;
  const working = value as Record<string, unknown>;
  return typeof working.lastRoute === 'string' && typeof working.updatedAt === 'string' && isValidCreationSessionFieldsV3(working.fields);
}

function isValidCreationSessionCheckpointV3(value: unknown): value is CreationSessionCheckpointV3 {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Record<string, unknown>;
  return typeof checkpoint.lastRoute === 'string' && typeof checkpoint.savedAt === 'string' && isValidCreationSessionFieldsV3(checkpoint.fields);
}

function isValidV3SnapshotShape(value: unknown): value is CreationSessionSnapshotV3 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CreationSessionSnapshotV3>;
  return (
    candidate.schemaVersion === LEGACY_V3_SCHEMA_VERSION &&
    (candidate.working === null || isValidCreationSessionWorkingV3(candidate.working)) &&
    (candidate.checkpoint === null || isValidCreationSessionCheckpointV3(candidate.checkpoint))
  );
}

// Success Means introduced a new mandatory step between Duration and
// Recipients (see lib/challenge-creation/steps.ts's BUILD/CUT/STOP_ROUTE_
// SEQUENCE). A v3 session resumed at any of these three routes predates
// that step entirely — resuming it verbatim would silently skip Success
// Means. Every earlier v3 route (goal through duration) is still the exact
// same logical position in v4's sequence and needs no remapping.
const ROUTES_AT_OR_AFTER_OLD_DURATION_BOUNDARY = ['/create/recipients', '/create/consequence', '/create/review'];

function migrateV3RouteToV4(route: string): string {
  return ROUTES_AT_OR_AFTER_OLD_DURATION_BOUNDARY.includes(route) ? '/create/success-means' : route;
}

/**
 * Never invents a threshold: successThresholdOverride is always null for a
 * migrated v3 session, meaning "use Kinwin's existing V1 baseline" — the
 * same default a brand-new v4 session gets (see
 * domain/challenge/success-rule.ts's clampSuccessThreshold(null, bounds)).
 */
function migrateV3FieldsToV4(fields: CreationSessionFieldsV3): CreationSessionFields {
  return { ...fields, successThresholdOverride: null };
}

/**
 * Exported for direct testing. Returns null for anything that is not a
 * structurally valid v3 snapshot — callers must treat that exactly like
 * any other corrupt/incompatible payload (remove it, do not resurrect a
 * malformed session under the new key).
 */
export function migrateCreationSessionV3ToV4(value: unknown): CreationSessionSnapshot | null {
  if (!isValidV3SnapshotShape(value)) return null;
  return {
    schemaVersion: CREATION_SESSION_SCHEMA_VERSION,
    working: value.working
      ? { fields: migrateV3FieldsToV4(value.working.fields), lastRoute: migrateV3RouteToV4(value.working.lastRoute), updatedAt: value.working.updatedAt }
      : null,
    checkpoint: value.checkpoint
      ? { fields: migrateV3FieldsToV4(value.checkpoint.fields), lastRoute: migrateV3RouteToV4(value.checkpoint.lastRoute), savedAt: value.checkpoint.savedAt }
      : null,
  };
}

/**
 * The single rule for what counts as "Continue challenge"-eligible —
 * centralized so Home and Account (both via
 * hooks/use-resumable-creation-session.ts) can never drift on it. A
 * background autosave write alone only ever touches `working`, never
 * `checkpoint`; only an explicit Save & exit sets checkpoint at all.
 */
export function isResumeEligibleSession(session: CreationSessionSnapshot | null): boolean {
  return session !== null && session.checkpoint !== null;
}

/**
 * Structural equality for two CreationSessionFields — used only to decide
 * whether Back needs to warn about changes made since the last explicit
 * checkpoint, never for persistence or security, so a stable
 * JSON.stringify comparison is precise enough for it: recipient ids are
 * assigned once (createRecipientDraft) and stay stable for the life of a
 * draft, so this isn't sensitive to incidental object-identity churn.
 */
function creationSessionFieldsEqual(a: CreationSessionFields, b: CreationSessionFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Returns null for "no session" and for corrupt/incompatible data alike —
 * callers never need to distinguish the two. Corrupt data is proactively
 * removed so it cannot linger and fail again later.
 *
 * If no current-version (v4) session exists, falls back to the legacy v3
 * key and migrates it in place (see migrateCreationSessionV3ToV4): a
 * structurally valid v3 session is converted, persisted under the v4 key,
 * and the v3 key is retired — v3 is read and migrated exactly once, never
 * kept around as an independently writable schema. A genuinely malformed
 * v3 payload is removed, exactly like a malformed v4 one.
 */
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

  if (raw) {
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

  return migrateLegacyV3Session(userId, storage);
}

async function migrateLegacyV3Session(userId: string, storage: CreationSessionStorage): Promise<CreationSessionSnapshot | null> {
  const legacyKey = creationSessionStorageKeyForVersion(LEGACY_V3_SCHEMA_VERSION, userId);
  let legacyRaw: string | null;
  try {
    legacyRaw = await storage.getItem(legacyKey);
  } catch {
    return null;
  }
  if (!legacyRaw) return null;

  let legacyParsed: unknown;
  try {
    legacyParsed = JSON.parse(legacyRaw);
  } catch {
    await storage.removeItem(legacyKey).catch(() => undefined);
    return null;
  }

  const migrated = migrateCreationSessionV3ToV4(legacyParsed);
  if (!migrated) {
    await storage.removeItem(legacyKey).catch(() => undefined);
    return null;
  }

  // Best-effort: persist the migration and retire the v3 key so it is
  // never re-read. If either write fails, the migrated session is still
  // returned in-memory so this read isn't lost — the next read simply
  // repeats the same (idempotent) migration from the still-present v3 key.
  try {
    await storage.setItem(creationSessionStorageKey(userId), JSON.stringify(migrated));
    await storage.removeItem(legacyKey);
  } catch {
    // See comment above — non-fatal.
  }
  return migrated;
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
 * Background autosave's write: overwrites only `working`, and carries
 * whatever `checkpoint` the caller currently has in memory through
 * completely unchanged (never re-derived from storage — see
 * hooks/use-creation-session-autosave.ts, which sources it from
 * onboarding context, itself only ever set by a successful
 * saveCreationSessionCheckpoint or by restoring an existing checkpoint).
 * Passing it explicitly rather than reading-then-merging inside this
 * function means a transient storage read failure can never be
 * misinterpreted as "no checkpoint exists" and silently erase a real one.
 *
 * Returns whether the write actually succeeded; autosave itself treats
 * this as fire-and-forget (a failure just gets retried on the next edit),
 * but the return value exists for the same reason every other mutation
 * here reports it: a caller with a stronger promise to keep (there isn't
 * one for background autosave itself, but the pattern must stay honest).
 * `generation` must be whatever currentCreationSessionGeneration(userId)
 * returned at the moment this write was scheduled — see the block comment
 * above creationSessionGenerations for why this is what actually closes
 * the debounce-window race a queue position alone cannot.
 */
export async function writeCreationSessionWorking(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  checkpoint: CreationSessionCheckpoint | null,
  storage: CreationSessionStorage,
  generation: number,
): Promise<boolean> {
  if (!userId) return true;
  return enqueueCreationSessionMutation(userId, async () => {
    if (generation !== currentCreationSessionGeneration(userId)) {
      // This write belongs to a creation lifecycle that has since been
      // closed (converted, discarded, or left-without-saving) — not a
      // failure, just no longer applicable. Actually writing it now would
      // resurrect a session that is supposed to stay gone.
      return true;
    }
    const snapshot: CreationSessionSnapshot = {
      schemaVersion: CREATION_SESSION_SCHEMA_VERSION,
      working: { fields, lastRoute, updatedAt: new Date().toISOString() },
      checkpoint,
    };
    try {
      await storage.setItem(creationSessionStorageKey(userId), JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The explicit "Save & exit" write: the one and only place `checkpoint`
 * is ever set. Sets `working` to the exact same fields at the same
 * instant — Save & exit represents the latest edit too, so there is
 * nothing for working to lag behind. `savedAt` is caller-supplied (not
 * generated here) so the in-memory onboarding checkpoint the caller sets
 * on success can carry the exact same timestamp as what was actually
 * persisted, rather than two independently-generated near-duplicates.
 * Returns whether the write actually succeeded; the caller must not mark
 * the in-memory session eligible (or tell the user their progress is
 * saved) until this is true. `generation` follows the same
 * schedule-time-capture rule as writeCreationSessionWorking.
 */
export async function saveCreationSessionCheckpoint(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  savedAt: string,
  storage: CreationSessionStorage,
  generation: number,
): Promise<boolean> {
  if (!userId) return true;
  return enqueueCreationSessionMutation(userId, async () => {
    if (generation !== currentCreationSessionGeneration(userId)) {
      return true;
    }
    const snapshot: CreationSessionSnapshot = {
      schemaVersion: CREATION_SESSION_SCHEMA_VERSION,
      working: { fields, lastRoute, updatedAt: savedAt },
      checkpoint: { fields, lastRoute, savedAt },
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

export type BackLeavePlan = 'proceed' | 'confirm_leave_without_saving';

/**
 * What components/v2/create-flow-screen.tsx's Back button should do when
 * this particular Back press would leave the creation flow entirely
 * (never mid-flow — only ever the route resolvePreviousCreationRoute
 * treats as the boundary; ordinary in-flow Back presses between steps
 * never call this at all and always just navigate).
 *
 * "Unsaved" is always relative to the explicit checkpoint, not merely
 * whether there is meaningful content:
 * - No checkpoint at all: any meaningful progress is unsaved (the
 *   original "fresh session, never saved" case).
 * - A checkpoint exists (this session was Continued, or just Saved &
 *   exited): only edits that actually differ from the checkpoint's
 *   fields count as unsaved — resuming a checkpoint and leaving again
 *   without changing anything loses nothing, since Continue would
 *   restore the exact same state either way.
 */
export function planBackLeaveAttempt(
  currentFields: CreationSessionFields,
  checkpointFields: CreationSessionFields | null,
): BackLeavePlan {
  const hasUnsavedWork = checkpointFields === null
    ? hasMeaningfulCreationProgress(currentFields)
    : !creationSessionFieldsEqual(currentFields, checkpointFields);
  return hasUnsavedWork ? 'confirm_leave_without_saving' : 'proceed';
}
