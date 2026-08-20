import assert from 'node:assert/strict';
import test from 'node:test';

import { planPreferredCurrencySave } from './preferred-currency-save';

test('planPreferredCurrencySave: proceeds when no write is in flight', () => {
  assert.equal(planPreferredCurrencySave(false), 'proceed');
});

test('planPreferredCurrencySave: ignores a second selection while a write is already in flight, so concurrent writes can never start', () => {
  assert.equal(planPreferredCurrencySave(true), 'ignored_in_flight');
});
