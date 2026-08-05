import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPaymentSheetPresentResult } from './payment-sheet-outcome';

test('no error is a completion', () => {
  assert.equal(classifyPaymentSheetPresentResult(null), 'completed');
  assert.equal(classifyPaymentSheetPresentResult(undefined), 'completed');
});

test('a Canceled error is a cancel, never treated as a failure', () => {
  assert.equal(classifyPaymentSheetPresentResult({ code: 'Canceled' }), 'canceled');
});

test('Failed and Timeout errors are both failures', () => {
  assert.equal(classifyPaymentSheetPresentResult({ code: 'Failed' }), 'failed');
  assert.equal(classifyPaymentSheetPresentResult({ code: 'Timeout' }), 'failed');
});

test('an unrecognized error code is treated as a failure, never silently as a completion', () => {
  assert.equal(classifyPaymentSheetPresentResult({ code: 'SomethingNew' }), 'failed');
});
