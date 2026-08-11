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

Provider order IDs, reward IDs, and redemption URLs are stored only in the private
schema. Owners, anonymous users, and ordinary recipients cannot read them. A consequence
becomes `reward_delivered` only after a trusted provider response supplies all three
pieces of evidence. Provider failure does not alter challenge failure or undo Stripe
payment truth.

This foundation is not production ready. A real Testflight roundtrip, operational
monitoring, provider webhook or status reconciliation, secret rotation, support policy,
lost-link recovery, and production security review remain required.
