import assert from 'node:assert/strict';
import test from 'node:test';

import { currencyForRegion, resolveDefaultCurrency } from './currency-default';

test('currencyForRegion maps Sweden to SEK', () => {
  assert.equal(currencyForRegion('SE'), 'SEK');
});

test('currencyForRegion maps euro-area regions to EUR', () => {
  for (const region of ['DE', 'FR', 'ES', 'IT', 'NL', 'FI', 'IE']) {
    assert.equal(currencyForRegion(region), 'EUR', `${region} should map to EUR`);
  }
});

// Bulgaria adopted the euro on 2026-01-01 — a Bulgarian locale must resolve
// to EUR, not the pre-adoption fallback of USD.
test('currencyForRegion maps Bulgaria to EUR', () => {
  assert.equal(currencyForRegion('BG'), 'EUR');
});

test('resolveDefaultCurrency: a Bulgarian locale with no saved preference falls back to EUR', () => {
  assert.equal(resolveDefaultCurrency(null, 'bg-BG'), 'EUR');
});

test('currencyForRegion falls back to USD for anywhere else, including null', () => {
  assert.equal(currencyForRegion('US'), 'USD');
  assert.equal(currencyForRegion('GB'), 'USD');
  assert.equal(currencyForRegion('JP'), 'USD');
  assert.equal(currencyForRegion(null), 'USD');
});

test('resolveDefaultCurrency: a saved preference always wins, regardless of locale', () => {
  assert.equal(resolveDefaultCurrency('EUR', 'sv-SE'), 'EUR');
  assert.equal(resolveDefaultCurrency('USD', 'de-DE'), 'USD');
});

test('resolveDefaultCurrency: no saved preference falls back to the locale-derived region', () => {
  assert.equal(resolveDefaultCurrency(null, 'sv-SE'), 'SEK');
  assert.equal(resolveDefaultCurrency(null, 'de-DE'), 'EUR');
  assert.equal(resolveDefaultCurrency(null, 'en-US'), 'USD');
});

test('resolveDefaultCurrency: deterministic — the same inputs always produce the same output', () => {
  const results = new Set(Array.from({ length: 5 }, () => resolveDefaultCurrency(null, 'sv-SE')));
  assert.equal(results.size, 1);
  assert.equal([...results][0], 'SEK');
});
