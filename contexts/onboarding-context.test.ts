import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRestoredCreationSessionState, createInitialOnboardingFields, createRecipientDraft, resolveFreshDraftCurrencyUpdate } from './onboarding-context';

test('createInitialOnboardingFields carries no leftover data — every field is a blank default', () => {
  const fields = createInitialOnboardingFields();
  assert.deepEqual(fields, {
    behaviorDirection: null,
    behaviorText: '',
    checkpoint: null,
    currency: 'USD',
    definitionText: '',
    durationWeeks: null,
    experienceCategory: null,
    goal: '',
    invitationMessage: '',
    invitationMessageCustomized: false,
    membershipChoice: null,
    measurementMode: null,
    rewardOrganizer: null,
    rhythm: {
      amountUnit: '',
      period: null,
      selectedWeekdays: [],
      targetValue: '',
      timeUnit: null,
      type: null,
    },
    savedDraftId: null,
    sitOutAcknowledged: false,
    stakeAmount: null,
    stakeAmountInput: '',
    successThresholdOverride: null,
  });
});

test('createInitialOnboardingFields returns a fresh rhythm object each call, so resetting one draft cannot mutate another', () => {
  const first = createInitialOnboardingFields();
  const second = createInitialOnboardingFields();
  assert.notEqual(first.rhythm, second.rhythm, 'rhythm must be a distinct object per call');
  first.rhythm.selectedWeekdays.push('monday');
  assert.deepEqual(second.rhythm.selectedWeekdays, [], 'mutating one snapshot must not affect another');
});

test('computeRestoredCreationSessionState always clears savedDraftId to null, even though the input type carries no such field, guarding against a stale server draft id surviving a local-session restore', () => {
  const fields = {
    ...createInitialOnboardingFields(),
    goal: 'Sleep better',
    recipients: [createRecipientDraft('Mom')],
  };
  // createInitialOnboardingFields() includes a savedDraftId field (it also
  // seeds resetDraft's baseline); restoreCreationSessionFields's real input
  // type never carries one, but this proves the guard holds even if a
  // caller's object happens to still have one attached, e.g. from spreading
  // an unrelated draft-shaped value.
  const withLeftoverDraftId = { ...fields, savedDraftId: 'server-draft-999' };
  const restored = computeRestoredCreationSessionState(withLeftoverDraftId, '/create/goal', '2026-01-01T00:00:00.000Z');
  assert.equal(restored.savedDraftId, null, 'a resumed local session must never carry a previous server draft id');
  assert.equal(restored.goal, 'Sleep better', 'restoring must not silently drop the real fields being restored');
});

test('computeRestoredCreationSessionState always sets the restored checkpoint to exactly the fields/lastRoute/savedAt being restored — restoring only ever happens for a session hooks/use-resumable-creation-session.ts already filtered down to an explicitly-saved one', () => {
  const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')] };
  const restored = computeRestoredCreationSessionState(fields, '/create/frequency', '2026-01-01T00:00:00.000Z');
  assert.deepEqual(restored.checkpoint, { fields, lastRoute: '/create/frequency', savedAt: '2026-01-01T00:00:00.000Z' });
});

// Guards the exact persisted/resumed-state path a device-beta report
// surfaced: app/create/duration.tsx's own controls can never produce a
// durationWeeks outside [2, 12] (its presets and custom stepper both clamp
// to that range), but neither restore boundary re-validated the range of
// an already-persisted value before this fix — only its type was checked
// upstream (lib/challenge-creation/creation-session.ts's
// isFiniteNumberOrNull for a local checkpoint; nothing at all for a
// resumed server draft, see loadDraftData in onboarding-context.tsx). A
// stale, corrupted, or otherwise out-of-range value — however it was
// originally written — would land the user on Duration with a value
// Continue can never accept and no visible reason why.
for (const invalid of [1, 0, -3, 13, 1.5]) {
  test(`computeRestoredCreationSessionState nulls an out-of-range persisted durationWeeks (${invalid}) instead of leaving a value Continue can never accept`, () => {
    const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')], durationWeeks: invalid };
    const restored = computeRestoredCreationSessionState(fields, '/create/duration', '2026-01-01T00:00:00.000Z');
    assert.equal(restored.durationWeeks, null, 'an invalid persisted duration must never be silently kept or coerced to a different value the user never chose');
    // The stored checkpoint itself must be sanitized the same way as the
    // live fields — never only one of the two — so a resumed session's own
    // "unsaved changes since last save" comparison does not see a false
    // diff the instant it opens, before the user has touched anything.
    assert.equal(restored.checkpoint.fields.durationWeeks, null);
    assert.equal(restored.goal, 'Sleep better', 'sanitizing the invalid field must never drop the rest of the restored progress');
  });
}

test('computeRestoredCreationSessionState leaves an in-range persisted durationWeeks untouched', () => {
  const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')], durationWeeks: 4 };
  const restored = computeRestoredCreationSessionState(fields, '/create/duration', '2026-01-01T00:00:00.000Z');
  assert.equal(restored.durationWeeks, 4);
  assert.equal(restored.checkpoint.fields.durationWeeks, 4);
});

// Same "null a structurally corrupt value rather than keep or coerce it"
// guard as durationWeeks, for Success Means' successThresholdOverride.
// This deliberately does NOT re-validate against the current baseline/total
// (those depend on duration + rhythm, which app/create/success-means.tsx's
// own clampSuccessThreshold call re-derives live) — only a value that could
// never have come from any real control (non-integer, zero, negative) is
// nulled here.
for (const invalid of [0, -3, 1.5]) {
  test(`computeRestoredCreationSessionState nulls a structurally invalid persisted successThresholdOverride (${invalid})`, () => {
    const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')], successThresholdOverride: invalid };
    const restored = computeRestoredCreationSessionState(fields, '/create/success-means', '2026-01-01T00:00:00.000Z');
    assert.equal(restored.successThresholdOverride, null);
    assert.equal(restored.checkpoint.fields.successThresholdOverride, null);
  });
}

test('computeRestoredCreationSessionState leaves a valid persisted successThresholdOverride untouched', () => {
  const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')], successThresholdOverride: 27 };
  const restored = computeRestoredCreationSessionState(fields, '/create/success-means', '2026-01-01T00:00:00.000Z');
  assert.equal(restored.successThresholdOverride, 27);
  assert.equal(restored.checkpoint.fields.successThresholdOverride, 27);
});

// True multi-currency V1's ONE fresh-draft-default boundary (see
// OnboardingProvider's currencyTouchedRef/fresh-draft-default effect,
// which calls this exact function): every genuinely new draft — signed
// out (locale only), signed in with no saved preference yet (locale
// only), signed in with a saved preference (preference wins) — resolves
// through this one rule, and a touched draft (explicit pick, or a
// loaded/restored draft's own already-chosen currency) is never
// overwritten, regardless of which resetDraft()/load/restore call site
// got there.
test('resolveFreshDraftCurrencyUpdate: a touched draft is never updated, regardless of the saved preference or locale', () => {
  assert.equal(resolveFreshDraftCurrencyUpdate(true, 'EUR', 'sv-SE'), null);
  assert.equal(resolveFreshDraftCurrencyUpdate(true, null, 'sv-SE'), null);
});

test('resolveFreshDraftCurrencyUpdate: an untouched draft with a saved preference resolves to that preference, regardless of locale — the saved preference always beats the locale default', () => {
  assert.equal(resolveFreshDraftCurrencyUpdate(false, 'EUR', 'en-US'), 'EUR');
  assert.equal(resolveFreshDraftCurrencyUpdate(false, 'USD', 'sv-SE'), 'USD');
});

test('resolveFreshDraftCurrencyUpdate: an untouched draft with no saved preference (signed out, or signed in with none set yet) falls back to the locale default', () => {
  assert.equal(resolveFreshDraftCurrencyUpdate(false, null, 'sv-SE'), 'SEK');
  assert.equal(resolveFreshDraftCurrencyUpdate(false, null, 'de-DE'), 'EUR');
  assert.equal(resolveFreshDraftCurrencyUpdate(false, null, 'en-US'), 'USD');
});

// True multi-currency V1: a draft's own currency is never re-derived or
// overridden by anything external (a saved profiles.preferred_currency,
// the device locale, etc.) when restoring a checkpoint — only
// hooks/use-create-challenge-entry.ts's startFreshCreation() ever applies
// a default, and only for a brand-new draft. computeRestoredCreationSessionState
// has no access to (and must never consult) any such external preference —
// it only ever carries through whatever currency the restored fields
// already had, exactly like every other already-chosen field.
test('computeRestoredCreationSessionState carries a restored draft\'s own currency through unchanged, never substituting a different default', () => {
  const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')], currency: 'SEK' as const };
  const restored = computeRestoredCreationSessionState(fields, '/create/consequence', '2026-01-01T00:00:00.000Z');
  assert.equal(restored.currency, 'SEK');
  assert.equal(restored.checkpoint.fields.currency, 'SEK');
});
