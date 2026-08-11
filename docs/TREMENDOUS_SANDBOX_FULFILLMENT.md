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

Provider creation and provider readiness are separate states. A successful creation
response stores immutable order and reward IDs and moves only to `provider_created`.
It does not change the public consequence. A polling reconciliation worker later reads
the reward by its persisted provider ID. Only an explicitly configured, verified ready
status together with a real HTTPS LINK artifact may set `reward_delivered`.

The current environment cannot reach Tremendous's primary developer documentation; the
documentation host returns HTTP 403. Status names, retrieval response fields, webhook
availability, and provider idempotency guarantees therefore remain unverified rather
than guessed. `TREMENDOUS_READY_REWARD_STATUSES` is intentionally required and empty by
default. The retrieval path template is likewise required and blank by default. Both
must be populated only after primary-doc and Testflight verification.

Polling is implemented because no webhook authenticity contract could be verified. No
Tremendous webhook endpoint has been fabricated. Processing rewards are polled again,
temporary transport/provider failures back off, and unknown IDs or terminal responses
move to support-required state without changing challenge or Stripe truth.

Provider order IDs, reward IDs, normalized status, and redemption URLs are stored only
in the private schema. Owners, anonymous users, and ordinary recipients cannot read
them. The accepted canonical organizer receives the URL only after verified readiness.

This foundation is not production ready. Primary-doc verification, a real Testflight
creation and delayed-readiness roundtrip, verified status mapping, provider idempotency
confirmation, operational monitoring, secret rotation, support policy, lost-link
recovery, and production security review remain required.
