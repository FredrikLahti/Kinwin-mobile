import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActiveChallengeViewModel, capBuildCompletions, isValidCutTotal, PlaybookEntry, PreviewConfiguration, PreviewEvent } from './challenge-preview-view-model';
const base = (overrides: Partial<PreviewConfiguration> = {}): PreviewConfiguration => ({ direction: 'build', measurement: 'completion', target: 3, periodUnit: 'week', unit: 'completions', durationWeeks: 6, wholeRequirement: 'Complete at least 16 of 18 planned sessions.', continuity: 'Complete at least 2 sessions every week.', ...overrides });
const view = (configuration: PreviewConfiguration, events: PreviewEvent[] = [], playbookEntries: PlaybookEntry[] = []) => buildActiveChallengeViewModel({ configuration, events, playbookEntries });
const recoveryEntry = (overrides: Partial<PlaybookEntry> = {}): PlaybookEntry => ({ id: 'p1', order: 2, source: 'recovery', sourceEventType: 'cut_total', sourceEventId: '1', direction: 'cut', obstacle: 'stress', strategy: 'next_opportunity', recoveryAction: 'Resume at the next planned opportunity', note: null, recoveryStatus: 'active', behavior: 'No smoking', ...overrides });
test('Build is truthful at zero, partial, target and capped', () => { assert.match(view(base()).currentPeriod.headline, /^0 of 3/); assert.equal(view(base(), [{ id: '1', order: 1, type: 'build_completion' }]).currentPeriod.status, 'in_progress'); assert.equal(view(base(), [1,2,3].map((order) => ({ id: String(order), order, type: 'build_completion' as const }))).currentPeriod.status, 'met'); assert.equal(capBuildCompletions(5, 3), 3); assert.equal(view(base()).recordedPeriods.kind, 'unavailable'); });
test('Cut back handles absent, within, exact and over totals', () => { const cut = base({ direction: 'cut', measurement: 'time', target: 120, unit: 'minutes', wholeRequirement: 'Stay within the limit.' }); assert.equal(view(cut).currentPeriod.status, 'not_recorded'); assert.match(view(cut, [{ id:'1', order:1, type:'cut_total', value:95 }]).currentPeriod.detail, /25 minutes remain/); assert.equal(view(cut, [{ id:'1', order:1, type:'cut_total', value:120 }]).currentPeriod.status, 'at_limit'); assert.match(view(cut, [{ id:'1', order:1, type:'cut_total', value:130 }]).currentPeriod.detail, /10 minutes over/); assert.equal(isValidCutTotal(-1, 'time'), false); assert.equal(isValidCutTotal(1.5, 'count'), false); });
test('Stop lapse is permanent through recovery view input and never creates financial action', () => { const stop = base({ direction:'stop', measurement:'abstinence', target:0, periodUnit:'challenge', unit:'lapses', wholeRequirement:'No lapses.' }); assert.equal(view(stop, [{ id:'1', order:1, type:'stop_status', status:'intact' }]).currentPeriod.status, 'intact'); const lapsed = buildActiveChallengeViewModel({ configuration:stop, events:[{ id:'1', order:1, type:'stop_status', status:'lapse' }], playbookEntries:[recoveryEntry({ sourceEventType:'stop_status', sourceEventId:'1', direction:'stop', recoveryStatus:'completed' })] }); assert.equal(lapsed.currentPeriod.status, 'lapse'); assert.equal(lapsed.consequenceState, 'preview_only_no_action'); assert.equal(stop.wholeRequirement, 'No lapses.'); });
test('Shared view exposes unknown history without probabilities', () => { const result = view(base()); assert.equal(result.successPossible.kind, 'unavailable'); assert.equal('probability' in result, false); assert.strictEqual(result, result); });

test('Cut back recovery lifecycle is tied to the specific over-limit event', () => {
  const cut = base({ direction: 'cut', measurement: 'count', target: 3, unit: 'times', wholeRequirement: 'Stay within the limit.' });
  const overLimitEvent: PreviewEvent = { id: 'e1', order: 1, type: 'cut_total', value: 5 };

  const unrecovered = view(cut, [overLimitEvent]);
  assert.equal(unrecovered.currentPeriod.status, 'over_limit');
  assert.equal(unrecovered.nextAction.type, 'continue_recovery');
  assert.equal(unrecovered.nextAction.label, 'Plan recovery');

  const withActiveRecovery = view(cut, [overLimitEvent], [recoveryEntry({ sourceEventId: 'e1', recoveryStatus: 'active' })]);
  assert.equal(withActiveRecovery.nextAction.type, 'continue_recovery');
  assert.equal(withActiveRecovery.nextAction.label, 'Continue recovery');

  const withCompletedRecovery = view(cut, [overLimitEvent], [recoveryEntry({ sourceEventId: 'e1', recoveryStatus: 'completed' })]);
  assert.notEqual(withCompletedRecovery.nextAction.label, 'Plan recovery');
  assert.equal(withCompletedRecovery.nextAction.type, 'update_total');
  // The original over-limit total must remain represented, not repaired.
  assert.equal(withCompletedRecovery.currentPeriod.status, 'over_limit');
  assert.match(withCompletedRecovery.currentPeriod.detail, /over the current limit/);

  // A genuinely new over-limit event (e.g. an updated total) is not treated as already recovered.
  const newOverLimitEvent: PreviewEvent = { id: 'e2', order: 2, type: 'cut_total', value: 7 };
  const afterNewEvent = view(cut, [overLimitEvent, newOverLimitEvent], [recoveryEntry({ sourceEventId: 'e1', recoveryStatus: 'completed' })]);
  assert.equal(afterNewEvent.nextAction.label, 'Plan recovery');
  assert.equal(afterNewEvent.currentPeriod.relevantEventId, 'e2');
});

test('Stop recovery lifecycle is tied to the specific lapse event', () => {
  const stop = base({ direction: 'stop', measurement: 'abstinence', target: 0, periodUnit: 'challenge', unit: 'lapses', wholeRequirement: 'No lapses.' });
  const lapseEvent: PreviewEvent = { id: 'e1', order: 1, type: 'stop_status', status: 'lapse' };

  const unrecovered = view(stop, [lapseEvent]);
  assert.equal(unrecovered.currentPeriod.status, 'lapse');
  assert.equal(unrecovered.nextAction.label, 'Plan recovery');

  const withActiveRecovery = view(stop, [lapseEvent], [recoveryEntry({ sourceEventType: 'stop_status', sourceEventId: 'e1', direction: 'stop', recoveryStatus: 'active' })]);
  assert.equal(withActiveRecovery.nextAction.label, 'Continue recovery');

  const withCompletedRecovery = view(stop, [lapseEvent], [recoveryEntry({ sourceEventType: 'stop_status', sourceEventId: 'e1', direction: 'stop', recoveryStatus: 'completed' })]);
  assert.notEqual(withCompletedRecovery.nextAction.label, 'Plan recovery');
  assert.equal(withCompletedRecovery.nextAction.type, 'recovery_completed');
  // The lapse and the zero-lapse rule must remain represented, not erased.
  assert.equal(withCompletedRecovery.currentPeriod.status, 'lapse');
  assert.match(withCompletedRecovery.currentPeriod.detail, /zero-lapse/);
});

test('Stop recovery tracks the latest lapse when two lapse events exist (e.g. a rapid double submission)', () => {
  const stop = base({ direction: 'stop', measurement: 'abstinence', target: 0, periodUnit: 'challenge', unit: 'lapses', wholeRequirement: 'No lapses.' });
  const firstLapse: PreviewEvent = { id: 'e1', order: 1, type: 'stop_status', status: 'lapse' };
  const secondLapse: PreviewEvent = { id: 'e2', order: 2, type: 'stop_status', status: 'lapse' };
  const events = [firstLapse, secondLapse];

  // The current period must key off the latest lapse by order, not the first one recorded.
  const unrecovered = view(stop, events);
  assert.equal(unrecovered.currentPeriod.status, 'lapse');
  assert.equal(unrecovered.currentPeriod.relevantEventId, 'e2');
  assert.equal(unrecovered.nextAction.label, 'Plan recovery');

  // A recovery created against the latest lapse (as recovery creation always does) is recognized as active.
  const withActiveRecovery = view(stop, events, [recoveryEntry({ sourceEventType: 'stop_status', sourceEventId: 'e2', direction: 'stop', recoveryStatus: 'active' })]);
  assert.equal(withActiveRecovery.nextAction.label, 'Continue recovery');

  // Once completed, the same latest lapse must not re-offer Plan recovery.
  const withCompletedRecovery = view(stop, events, [recoveryEntry({ sourceEventType: 'stop_status', sourceEventId: 'e2', direction: 'stop', recoveryStatus: 'completed' })]);
  assert.notEqual(withCompletedRecovery.nextAction.label, 'Plan recovery');
  assert.equal(withCompletedRecovery.nextAction.type, 'recovery_completed');
  // Neither lapse is erased or repaired: the period stays lapsed and zero-lapse remains explicit.
  assert.equal(withCompletedRecovery.currentPeriod.status, 'lapse');
  assert.match(withCompletedRecovery.currentPeriod.detail, /zero-lapse/);
});

test('A manual Playbook entry never masks an unaddressed failure event', () => {
  const cut = base({ direction: 'cut', measurement: 'count', target: 3, unit: 'times', wholeRequirement: 'Stay within the limit.' });
  const overLimitEvent: PreviewEvent = { id: 'e1', order: 1, type: 'cut_total', value: 5 };
  const manualNote = recoveryEntry({ source: 'manual', sourceEventId: 'e1', recoveryStatus: 'completed' });
  const result = view(cut, [overLimitEvent], [manualNote]);
  assert.equal(result.nextAction.label, 'Plan recovery');
});

test('Home and Progress derive the same current-period state from one view model', () => {
  const cut = base({ direction: 'cut', measurement: 'count', target: 3, unit: 'times', wholeRequirement: 'Stay within the limit.' });
  const events: PreviewEvent[] = [{ id: 'e1', order: 1, type: 'cut_total', value: 2 }];
  const homeView = view(cut, events);
  const progressView = view(cut, events);
  assert.deepEqual(homeView.currentPeriod, progressView.currentPeriod);
  assert.deepEqual(homeView.nextAction, progressView.nextAction);
});
