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

This foundation is not production ready. A real Testflight creation, idempotency,
retrieval, and generate-link roundtrip, hosted deployment, operational monitoring,
secret rotation, support policy, lost-link recovery, and production security review
remain required.
