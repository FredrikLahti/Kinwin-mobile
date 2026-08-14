/**
 * Kinwin's current beta build always runs on Stripe TEST mode and
 * Tremendous sandbox rails (see docs/BETA_TEST_ENVIRONMENT.md) — no real
 * money moves and no real reward has value yet. This is the single place
 * that copy lives; every screen that shows it imports this constant, so a
 * future production, real-money build can find and remove/replace it here
 * without having to hunt through each screen individually.
 */
export const BETA_PAYMENT_TEST_MODE_NOTICE =
  'Beta test: payments are simulated. No real money will be charged.';
