# Tremendous sandbox fulfillment

Kinwin v1 creates one full-value fulfillment for one successfully charged failed
consequence. The stake is not split. The immutable canonical reward organizer is the
single LINK handoff target and coordinates the category-appropriate reward or experience
for the locked recipient group. The challenge owner does not participate.

The server-only worker requires terminal failure, a succeeded Stripe charge,
`reward_fulfillment_pending`, and accepted organizer access. A unique fulfillment row
and stable consequence-derived idempotency key survive retries and worker crashes. The
database lease prevents overlapping workers, and row claims use `skip locked`.

The adapter accepts only the Tremendous Testflight origin. API key, funding source, and
campaign configuration live only in Supabase Function secrets. No `EXPO_PUBLIC_` value
contains provider configuration.

Tremendous documents `external_id` as the order idempotency contract. Kinwin maps the
stable `kinwin-reward:<consequence-id>` identity to it. Repeating creation returns the
original order instead of creating another. No undocumented idempotency header is used.

Provider creation and provider readiness are separate states. A successful creation
response stores immutable order and reward IDs and moves only to `provider_created`.
Although the LINK creation response contains a reward link, Kinwin discards it because
Tremendous treats links as secrets and recommends that integrations do not persist them.

Polling `GET /api/v2/rewards/{reward_id}` is the v1 reconciliation source. A LINK reward
is ready only when `delivery.status` is `SUCCEEDED`. `PENDING` and `SCHEDULED` are polled
again. `FAILED`, unknown statuses, identity mismatches, and non-LINK methods fail closed.
The GET response intentionally does not contain the reward link.

Tremendous delivery success/failure webhooks do not apply to LINK rewards, so polling is
the correct readiness mechanism. `ORDERS.FAILED` is also not used: single-reward API
orders fail synchronously in the creation response. Future fraud/cancel event use can be
assessed separately.

Provider order IDs, reward IDs, and normalized status are stored only in the private
schema. No reward link column remains. Once provider status is `SUCCEEDED`, the accepted
canonical organizer can explicitly choose `Open reward`. The trusted server calls
`POST /api/v2/rewards/{reward_id}/generate_link` and returns the HTTPS link transiently.
The link is never stored or logged. Generating a new link does not invalidate old links.

The accepted Kinwin organizer invitation is the durable recovery channel. `Share again`
rotates only its hashed bearer token, preserving acceptance and every immutable organizer and
provider binding. An organizer who loses a Tremendous link returns to the private route and
chooses `Open reward` again. No email or phone number is required. The server allows one
generate-link reservation per fulfillment every 30 seconds to absorb duplicate taps. A later
recovery request remains available. It records only request time, outcome, safe failure code,
and aggregate timestamps/counts, never the token or generated URL.

Supabase Cron wakes challenge completion every 15 minutes and consequence charging hourly.
Reward creation runs at minutes 7 and 37, while LINK reconciliation runs at minutes 5, 20, 35,
and 50. The schedules contain no business truth: eligibility checks, atomic row claims, and the
shared 20-minute lease remain authoritative. A new worker run reclaims creation or reconciliation
claims older than 25 minutes. Exhausted creation or reconciliation retries become
`terminal_failure`, which is the explicit support-required state. Recovery never creates a
replacement reward or changes challenge, payment, amount, recipients, organizer, or provider IDs.

`private.reward_fulfillment_health` is the service-only support projection. It reports safe
normalized operational state, immutable internal IDs, invitation status, attempt counts,
timestamps, next retry, and bounded failure code. Reward-link access events provide similarly
minimal auditability. Neither surface contains tokens, provider credentials, payment methods,
raw provider responses, or reward URLs. `reward_delivered` means the LINK is provider-ready for
organizer handoff, not that a person redeemed it or consumed the experience.

This foundation is not production ready. A real Testflight creation, idempotency,
retrieval, and generate-link roundtrip, hosted TEST deployment, operational alert delivery,
secret rotation, support playbooks, and production security review remain required. The schema,
functions, schedules, recovery policy, and service-only health projection are deployment-ready,
but no hosted environment was changed without authenticated TEST-project access.
