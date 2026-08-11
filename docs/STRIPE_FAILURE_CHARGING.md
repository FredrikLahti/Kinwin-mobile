# Stripe failure charging (test mode)

## Authority boundaries

Challenge truth is the persisted `challenges.challenge_status`. Only a terminal
`completed_failure` is eligible. The payment worker never finalizes challenges and
Stripe availability can never change a challenge result.

Payment truth is Stripe plus a signature-verified webhook persisted by Kinwin. A
successful response to `PaymentIntent.create` is deliberately recorded as
`processing`; only `payment_intent.succeeded` moves the obligation to `succeeded`
and the consequence to `reward_fulfillment_pending`.

Reward truth is a future Tremendous package. This package creates no reward
fulfillment and calls no reward provider.

## Existing setup reused

The existing SetupIntent uses `usage=off_session`, cards only, a stable Stripe
Customer per owner, and a webhook-confirmed saved PaymentMethod. Activation already
requires that verified authorization. The existing consent explicitly states the
locked stake, conditional failure charge, automatic/offline use, and commitment-only
scope, so no UI change was required.

Kinwin currently imports `stripe@^22` without an explicit `apiVersion`, so requests
use the Stripe account's configured default API version. The package continues that
existing behavior rather than guessing or silently changing a financial API version.

## Obligation and retry state machine

Exactly one private `consequence_charge_attempts` row exists per consequence. Despite
the legacy table name, that row is the durable logical obligation and retains its
locked consequence amount/currency, owner, Customer, PaymentMethod, one PaymentIntent,
attempt count, timestamps, safe failure category, and next retry time.

States are `pending`, `processing`, `succeeded`, `temporary_failure`,
`requires_action`, `requires_payment_method`, `permanently_failed`, and `canceled`.
Automatic attempts are capped at three. Temporary failures back off for one hour
after the first attempt and six hours thereafter. Paid and action-required rows are
never automatically retried. A replacement SetupIntent may update only the saved
PaymentMethod reference and resume the same obligation; amount and PaymentIntent
identity remain unchanged.

The worker runs separately from challenge completion, under the existing named Cron
secret boundary. Database uniqueness is the durable one-obligation guarantee. Stripe
creation additionally uses `kinwin-failure-payment:<obligation-id>` as a deterministic
idempotency key. Webhook event IDs share the existing durable event ledger, so
duplicate delivery is a no-op.

No client endpoint accepts an amount, owner, Customer, or PaymentMethod. The narrow
service-role RPC derives every financial input from the completed challenge,
consequence, and provider-reference rows. Private operational tables remain hidden
from client roles and are sufficient for database-level operational inspection.
