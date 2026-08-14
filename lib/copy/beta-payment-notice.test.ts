import assert from 'node:assert/strict';
import test from 'node:test';

import { findBannedDashes } from './dash-guard';
import { BETA_PAYMENT_TEST_MODE_NOTICE } from './beta-payment-notice';

test('the beta payment test-mode notice is short, dash-guard clean, and says no real money moves', () => {
  assert.ok(BETA_PAYMENT_TEST_MODE_NOTICE.length <= 80, 'should stay short enough to not dominate a screen');
  assert.match(BETA_PAYMENT_TEST_MODE_NOTICE, /no real money/i);
  assert.equal(findBannedDashes(`'${BETA_PAYMENT_TEST_MODE_NOTICE}'`).length, 0);
});
