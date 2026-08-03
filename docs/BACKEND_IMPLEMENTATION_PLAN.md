# Backend implementation plan

Recommended sequence for turning the validated domain model and initial Supabase
migration (`supabase/migrations/20260803000000_initial_kinwin_schema.sql`, exercised in
`supabase/tests/`) into a working backend, after founder review of the prototype. Each
phase is a separate, focused package — do not start a phase before its prerequisite
product decisions (tracked in `docs/PRODUCTION_DATA_MODEL.md` and
`docs/SUPABASE_SCHEMA.md`) are resolved.

## 1. Authentication and profile ownership

- **Trusted boundary:** Supabase Auth (GoTrue) issues and verifies JWTs; `auth.uid()` is
  the only identity source `public.profiles` and every `owner_id` column trust.
- **Tables/functions:** `public.profiles` (exists). Consider a trigger that inserts a
  profile row on `auth.users` signup, so the client never has to.
- **Client responsibilities:** Sign up/in via the Supabase Auth SDK; create/update its
  own `profiles.display_name`.
- **Server responsibilities:** Nothing beyond what Auth already provides, plus the
  optional signup trigger above.
- **Prerequisite product decisions:** Which sign-in methods are offered (email/password,
  magic link, Sign in with Apple/Google) — not yet decided anywhere in the docs.
- **Minimum tests:** `supabase/tests/020`–`040` already prove profile RLS; add one test
  against a real GoTrue-issued JWT once the local Supabase stack is available.
- **Must remain impossible from the client:** Setting another user's `id`; reading any
  other profile; writing `auth.users` directly.

## 2. Editable draft persistence

- **Trusted boundary:** None yet — this is the pre-commitment stage, so the client owns
  its own draft outright.
- **Tables/functions:** `public.challenge_drafts` (exists).
- **Client responsibilities:** Map live `OnboardingContext` state through the existing
  `mapOnboardingDraft` anti-corruption boundary and upsert the result into
  `draft_payload`.
- **Server responsibilities:** None beyond the constraints already in place.
- **Prerequisite product decisions:** None blocking; this phase is structurally ready
  today. It only needs `@supabase/supabase-js` wiring, which is explicitly out of scope
  until the founder approves connecting the app to a real project.
- **Minimum tests:** Round-trip a real `mapOnboardingDraft(...)` result through
  insert/update and back; `supabase/tests/010_seed.sql` already does this once.
- **Must remain impossible from the client:** Writing another owner's draft (proven in
  `030`/`040`); a `recipients` array outside 0–4 entries (constraint proven in `070`).

## 3. Trusted atomic activation

- **Trusted boundary:** A single server-side transaction (Postgres function or Edge
  Function running as `service_role`) — never the client — decides a draft is ready and
  creates the commitment.
- **Tables/functions:** Writes `challenges` (with `activation_snapshot`),
  `challenge_recipients`, and `consequences` atomically; a new trusted function
  (`activate_challenge_draft` or similar) does not exist yet.
- **Client responsibilities:** Trigger activation and render the result; it can never
  construct `activation_snapshot` itself (no write grant exists on `challenges`).
- **Server responsibilities:** Re-run `validateActivationReadiness`-equivalent checks
  server-side (never trust the client's own pass/fail), generate IDs, and write the
  snapshot, recipients, and consequence row in one transaction.
- **Prerequisite product decisions:** Recipient replacement after activation; whether
  challenge start waits for sharing — both listed as unresolved.
- **Minimum tests:** Atomicity under simulated partial failure (rollback leaves no
  half-created challenge); re-validation rejects a tampered/incomplete draft even when a
  client-side check would have passed; the immutability trigger (proven in
  `060_immutability_and_append_only.sql`) continues to block any later tampering.
- **Must remain impossible from the client:** Any direct write to `challenges`,
  `challenge_recipients`, or `consequences` (already proven — no grant); activating the
  same draft twice.

## 4. Server-generated periods

- **Trusted boundary:** Period generation runs server-side, in the snapshot's timezone,
  with an explicit DST policy — the `GeneratePeriods` TypeScript type is currently only a
  signature, deliberately unimplemented.
- **Tables/functions:** `public.challenge_periods`; a real implementation of
  `GeneratePeriods`.
- **Client responsibilities:** Read-only display.
- **Server responsibilities:** Implement the actual generation algorithm once the DST
  policy is decided.
- **Prerequisite product decisions:** "Exact timezone and daylight-saving period
  generation" — explicitly unresolved.
- **Minimum tests:** Period boundaries across a real DST transition, once the policy
  exists; `ends_at > starts_at` is already constraint-proven in `070_constraints.sql`.
- **Must remain impossible from the client:** Inserting or mutating periods (already
  proven — no grant).

## 5. Trusted idempotent check-in append

- **Trusted boundary:** An append endpoint validates ownership, challenge state, period
  membership, event shape, and idempotency server-side before insert.
- **Tables/functions:** `public.check_in_events`; a new append function/endpoint.
- **Client responsibilities:** Submit an event with a client-generated idempotency key;
  keep the existing local optimistic preview (`lib/challenge-preview-view-model.ts`)
  unchanged as the UI layer.
- **Server responsibilities:** Validate and insert. Append-only is now enforced in the
  database itself (`060` proved `UPDATE`/`DELETE` are rejected for every role, including
  `service_role`), so a bug here can corrupt at most one bad insert, never history.
- **Prerequisite product decisions:** Correction policy is unresolved, and the audit
  found the TypeScript and SQL models don't yet agree on its shape: `CheckInBase`
  carries a generic `correctsEventId`, `CutBackTotalEvent` separately carries
  `supersedesEventId`, but the SQL schema implements only one mechanism (a distinct
  `'correction'` `event_type` plus `correction_of_event_id`). Reconcile these before
  building the endpoint.
- **Minimum tests:** Idempotency-key replay does not duplicate-insert (unique index
  proven in schema creation); cross-challenge correction is rejected (proven in `060`);
  add per-event-type payload shape validation at the trusted-function layer — the
  database only checks `event_payload` is a non-empty JSON object today, deliberately
  deferring shape validation to this future endpoint.
- **Must remain impossible from the client:** Any direct insert/update/delete on
  `check_in_events` (already proven — no grant, and update/delete are now rejected for
  every role).

## 6. Deterministic versioned evaluation

- **Trusted boundary:** A pure, versioned function, run server-side only, over closed
  periods and trusted (server-timestamped) events. `evaluateChallenge` in
  `domain/challenge/results.ts` is currently a deliberate stub that always returns
  `evaluable: false` — verified by reading its source, not an oversight.
- **Tables/functions:** Reads `challenge_periods` and `check_in_events`; writes
  `challenges.challenge_status`/`completed_at`.
- **Client responsibilities:** Read-only display of `challenge_status` and any result
  summary the server produces.
- **Server responsibilities:** Implement the real per-direction algorithms (build,
  cut_back, stop) matching each `SuccessRuleSnapshot.ruleVersion`, and keep old versions
  reproducible.
- **Prerequisite product decisions:** "Exact Cut back continuity safeguard" — unresolved,
  and evaluation cannot be written correctly without it.
- **Minimum tests:** Golden-file tests reproducing each `ruleVersion`'s algorithm against
  fixed period/event fixtures; the immutability trigger already proven to still allow
  `challenge_status`/`completed_at` writes post-evaluation.
- **Must remain impossible from the client:** Supplying its own evaluation result;
  evaluation running on non-closed periods or events missing `server_recorded_at` (both
  already guarded by the existing TypeScript stub's refusal conditions).

## 7. Membership synchronization and Completion Mode

- **Trusted boundary:** Membership state changes only via a verified App
  Store/Play/billing webhook, never a client write (none exists today).
- **Tables/functions:** `public.memberships`; a new webhook handler.
- **Client responsibilities:** Read-only.
- **Server responsibilities:** On webhook receipt, update `membership_status`/
  `access_mode`, and atomically transition `challenges.challenge_status` to
  `'completion_mode'` where `domain/membership/types.ts`'s `accessModeFor` says so.
- **Prerequisite product decisions:** "Exact App Store and Google Play entitlement
  integration" — unresolved.
- **Minimum tests:** Webhook idempotency/replay; a direct unit test that the server
  transition matches the already-pure `accessModeFor` function exactly.
- **Must remain impossible from the client:** Writing its own `membership_status` or
  `access_mode` (already proven — no grant).

## 8. Payment authorization and charging

- **Trusted boundary:** Stripe (or equivalent) integration, entirely server-side; the
  `private` schema is unreachable to any client role (proven in `050`).
- **Tables/functions:** `public.consequences`, `private.consequence_provider_references`,
  `private.consequence_charge_attempts`.
- **Client responsibilities:** Collect a payment method via a hosted Stripe
  element/SDK that talks to Stripe directly — the app never handles raw card data — and
  display `consequences.status`.
- **Server responsibilities:** Authorize on activation; charge only after trusted
  evaluation (phase 6) reaches `failure`, using the idempotency-key-protected attempt
  history proven in `070`.
- **Prerequisite product decisions:** "Payment retry and grace rules"; "Dispute and
  manual-review process" — both unresolved.
- **Minimum tests:** Idempotency-key replay (constraint already proven); a charge must
  never originate from a client-claimed failure — architecturally guaranteed today by
  private-schema isolation (proven in `050`).
- **Must remain impossible from the client:** Any read or write of provider references
  or charge attempts (proven); triggering a charge directly.

## 9. Reward fulfillment

- **Trusted boundary:** Tremendous (or equivalent) integration, server-side only.
- **Tables/functions:** `private.reward_fulfillments`.
- **Client responsibilities:** Read only `consequences.status`
  (`reward_fulfillment_pending`/`reward_delivered`), never fulfillment provider details.
- **Server responsibilities:** Create a fulfillment request only after a successful
  charge; mark delivered.
- **Prerequisite product decisions:** "Durable identity and contact requirements for an
  external reward organizer" — unresolved.
- **Minimum tests:** `status = 'delivered'` requires `delivered_at` — already
  constraint-proven in `070_constraints.sql`.
- **Must remain impossible from the client:** Any access to `private.reward_fulfillments`
  (proven).

## 10. Invitations and recipient access

- **Trusted boundary:** Currently entirely unbuilt. The audit confirmed zero `anon`
  policies or grants exist anywhere in the schema today — "future access unresolved" in
  the docs is accurate, not aspirational.
- **Tables/functions:** `public.invitations`; a new, narrowly scoped access mechanism
  (e.g. a signed, single-use token validated server-side) — not a raw `anon` RLS policy
  against owner-facing tables.
- **Client responsibilities (recipient side):** A distinct, purpose-built flow that only
  ever sees the intentionally narrow preview a token grants — never `challenges` or
  `check_in_events` directly, mirroring today's `/share/preview` UI preview but backed by
  a real, scoped read.
- **Server responsibilities:** Issue and validate invitation tokens; record
  accept/decline in `invitations`.
- **Prerequisite product decisions:** "Whether challenge start waits for sharing";
  recipient replacement policy; and the access mechanism itself is still an open design
  question, not just an implementation detail.
- **Minimum tests:** A recipient token must not grant access to anything beyond its
  specific scoped view — this needs its own RLS design and its own tests once decided,
  never a reuse of the owner policies proven in `030`/`040`.
- **Must remain impossible from the client:** Any anonymous read of `challenges`,
  `check_in_events`, or `consequences` — proven impossible today by design; must not
  regress when recipient access is added.

## 11. Administrative / manual-review tooling

- **Trusted boundary:** `service_role`-authenticated internal tooling only, fully
  audited; never reachable by `anon` or `authenticated`.
- **Tables/functions:** Reads/writes across the schema via the already-fully-granted
  `service_role` (proven); needs a new, dedicated audit-log table, which does not exist
  yet.
- **Client responsibilities:** None — this is not part of the mobile app.
- **Server responsibilities:** A separate, access-controlled admin surface; every manual
  action attributable and logged.
- **Prerequisite product decisions:** "Dispute and manual-review process"; "Account
  deletion during an active financial commitment" — both unresolved, and both are
  policy questions, not engineering ones.
- **Minimum tests:** Every admin mutation is attributable and logged (needs the audit
  table above before it's testable).
- **Must remain impossible from the client:** Any admin action without an audit trail;
  any admin path reachable by `anon`/`authenticated`.
