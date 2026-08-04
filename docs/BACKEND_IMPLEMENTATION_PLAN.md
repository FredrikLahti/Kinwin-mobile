# Backend implementation plan

Recommended sequence for turning the validated domain model and initial Supabase
migration (`supabase/migrations/20260803000000_initial_kinwin_schema.sql`, exercised in
`supabase/tests/`) into a working backend, after founder review of the prototype. Each
phase is a separate, focused package — do not start a phase before its prerequisite
product decisions (tracked in `docs/PRODUCTION_DATA_MODEL.md` and
`docs/SUPABASE_SCHEMA.md`) are resolved.

## 1. Authentication and profile ownership — implemented, verified against real local GoTrue/PostgREST in CI

- **Trusted boundary:** Supabase Auth (GoTrue) issues and verifies JWTs; `auth.uid()` is
  the only identity source `public.profiles` and every `owner_id` column trust.
- **Tables/functions:** `public.profiles` (exists). `20260804000000_profile_on_signup.sql`
  adds the `on_auth_user_created` trigger that inserts a bare profile row on signup, so
  the client never selects its own profile id.
- **Client responsibilities:** `contexts/auth-context.tsx` wraps `supabase.auth.signUp`/
  `signInWithPassword`/`signOut`, persists the session via AsyncStorage, and exposes
  `updateDisplayName` for `profiles.display_name`. `app/auth/index.tsx` is the sign-in/up
  screen; `app/account/index.tsx` is the minimal account surface.
- **Server responsibilities:** Nothing beyond what Auth already provides, plus the
  signup trigger above.
- **Prerequisite product decisions:** Which sign-in methods are offered — resolved for
  this package as email/password only for the internal beta; Apple/Google remain future
  work the auth boundary is shaped to add without touching unrelated code.
- **Minimum tests:** `supabase/tests/020`–`040` prove profile RLS; `080_profile_trigger.sql`
  proves the signup trigger's identity match and idempotency, all against the local
  `000_auth_stub.sql` stand-in (this dev sandbox cannot reach Docker image registries or
  GitHub release binaries — see git history for the earlier bounded attempts). The real
  GoTrue layer that stub stands in for is covered separately:
  `supabase/tests/e2e/auth-and-draft.e2e.ts`, run in CI
  (`.github/workflows/supabase-e2e.yml`) against a real `supabase start` local stack,
  signs a user up through real GoTrue, confirms the profile trigger fired for a real
  `auth.users` row, and signs in to get a real GoTrue-issued JWT.
- **Must remain impossible from the client:** Setting another user's `id`; reading any
  other profile; writing `auth.users` directly.

## 2. Editable draft persistence — implemented, verified against real local GoTrue/PostgREST in CI

- **Trusted boundary:** None yet — this is the pre-commitment stage, so the client owns
  its own draft outright.
- **Tables/functions:** `public.challenge_drafts` (exists).
- **Client responsibilities:** `lib/supabase/challenge-draft-repository.ts` maps live
  `OnboardingContext` state through the existing `mapOnboardingDraft` anti-corruption
  boundary and upserts the result into `draft_payload` once the draft is fully valid
  (wired at the `/share/activate` trial-selection point); `fetchLatestEditableDraft` plus
  `domain/challenge/to-onboarding-draft.ts`'s `restoreOnboardingDraftData` load and
  restore the most recent saved draft back into onboarding state via the same explicit
  mapping-boundary pattern, in reverse.
- **Server responsibilities:** None beyond the constraints already in place.
- **Prerequisite product decisions:** None blocking.
- **Minimum tests:** `domain/challenge/onboarding-draft-mapping.test.ts` round-trips
  `mapOnboardingDraft` → `restoreOnboardingDraftData` → `mapOnboardingDraft` for every
  direction (build/cut_back/stop) and proves recipient-id stability across repeated
  saves; `supabase/tests/010_seed.sql` exercises a real insert of the mapped shape.
  `supabase/tests/e2e/auth-and-draft.e2e.ts` (CI only) additionally proves, against a
  real local PostgREST: insert vs. update of the same draft id without duplicating the
  row, reload/readback round-tripping the saved data, a second user unable to read or
  change the draft, and signed-out access unable to read it.
- **Must remain impossible from the client:** Writing another owner's draft (proven in
  `030`/`040`); a `recipients` array outside 0–4 entries (constraint proven in `070`).

## 3a. Trusted draft-to-pending-commitment preparation — implemented, verified against real local GoTrue/PostgREST in CI

- **Trusted boundary:** `public.prepare_challenge_from_draft` — a `SECURITY DEFINER`
  Postgres function, never the client — requires a real `auth.uid()`, loads the draft
  from the database (never from client-supplied contents), and atomically creates the
  commitment.
- **Tables/functions:** `supabase/migrations/20260805000000_prepare_challenge_from_draft.sql`
  atomically writes one `challenges` row with `challenge_status = 'pending_activation'`
  (no `activation_snapshot`, timestamps, or timezone — those stay null by the table's own
  CHECK constraint), its `challenge_recipients`, and one `consequences` row in an honest
  pre-payment state (`'payment_method_required'`), then archives the source draft. It
  deliberately does **not** create membership, payment authorization, challenge periods,
  invitations, or an active status — see phase 3b below for those.
- **Client responsibilities:** `lib/supabase/challenge-repository.ts`'s
  `prepareChallengeFromDraft` calls the RPC once a draft has been saved as
  `ready_for_activation` (wired into `app/share/activate.tsx` right after
  `saveChallengeDraft` succeeds); it can never construct any of the written rows itself
  (no write grant exists on `challenges`/`challenge_recipients`/`consequences`). The
  screen renders this server-saved pending commitment as a state clearly distinct from
  the pre-existing local, session-only "Preview active challenge" prototype shortcut,
  which is unchanged and still writes nothing.
- **Server responsibilities:** Re-run `validateActivationReadiness`-equivalent checks
  server-side (never trust the client's own pass/fail or the draft's own coarse CHECK
  constraints), and write the challenge, recipients, and consequence row in one atomic
  transaction; return the same result on a repeated request for an already-prepared
  draft instead of creating a duplicate (enforced by a unique partial index on
  `challenges.source_draft_id`, with a `unique_violation` handler for the concurrent-call
  race).
- **Prerequisite product decisions:** Recipient confirmation does not block preparation;
  recipients cannot be replaced by the user after commitment creation — both resolved for
  this package.
- **Minimum tests:** `supabase/tests/090_prepare_challenge_from_draft.sql` proves atomic
  row creation, draft archival, idempotent repeats, non-owner rejection (indistinguishable
  from "not found"), rejection of incomplete/tampered drafts that still pass the draft
  table's own looser constraints, unauthenticated/anonymous rejection, and — via a
  deliberately-failed wrapping transaction — that a downstream failure leaves every
  row count unchanged (true atomicity, not several separately-observable statements).
  `supabase/tests/e2e/prepare-challenge.e2e.ts` (CI only) re-proves the success path,
  idempotent repeat, cross-user rejection, and that direct client writes remain
  impossible, against a real GoTrue-issued JWT and real PostgREST RPC call.
- **Must remain impossible from the client:** Any direct write to `challenges`,
  `challenge_recipients`, or `consequences` (already proven — no grant); preparing the
  same draft twice; preparing another user's draft; a fake active/activated status.

## 3a-ii. Pending-commitment management (read + cancel) — implemented, verified against real local GoTrue/PostgREST in CI

- **Trusted boundary:** Reads use the same owner-only RLS policies and grants proven in
  phase 2/3a — no new policy or grant exists for this. Cancellation is a new
  `SECURITY DEFINER` function, `public.cancel_pending_challenge`
  (`supabase/migrations/20260806000000_cancel_pending_challenge.sql`), the only path
  that can move `challenge_status`/`consequences.status` to `canceled_before_activation`.
- **Tables/functions:** Reads `challenges`, `challenge_recipients`, `consequences`, and
  the archived source draft's `draft_payload` (the only place the goal/behavior/
  successRule/duration/experience category still exist pre-full-activation). Writes,
  atomically: `challenges.challenge_status` and `consequences.status` to
  `'canceled_before_activation'`. Deletes nothing, ever — the challenge, its recipients,
  its consequence, and the archived draft all survive a cancellation unchanged apart
  from those two status columns.
- **Client responsibilities:** `lib/supabase/challenge-repository.ts`'s
  `fetchPendingCommitment` reads the latest pending commitment and restores the archived
  draft's payload through the existing `restoreOnboardingDraftData` boundary (reversed
  from phase 2) to render a read-only summary; `cancelPendingChallenge` calls the RPC.
  `app/account/pending-commitment.tsx` is the new entry point (linked from
  `app/account/index.tsx`), rendering loading/none/summary/payment-placeholder/confirm/
  canceling/canceled/error states. The summary is never editable and never offers
  recipient replacement; "Continue setup" only ever opens a truthful placeholder
  explaining payment setup is still future work — it never fakes Stripe or an active
  status. Canceling resets local onboarding state so a new draft never inherits any
  field from the canceled one.
- **Server responsibilities:** Verify ownership and current status before canceling;
  reject cancellation of anything other than `pending_activation` (indistinguishable
  "not found" response for both a missing challenge and one owned by someone else); stay
  idempotent for a repeated cancel of an already-canceled challenge.
- **Prerequisite product decisions:** None blocking — recipients already cannot be
  replaced (no relevant write path exists at all), and cancellation before activation was
  explicitly scoped for this package.
- **Minimum tests:** `supabase/tests/100_cancel_pending_challenge.sql` proves owner
  reads, non-owner/anon read denial, atomic cancellation (challenge and consequence
  together), idempotent repeats, non-owner cancel rejection, rejection of canceling an
  already-`active` challenge, that nothing is deleted, and that a new draft can be
  created afterward. `supabase/tests/e2e/pending-commitment.e2e.ts` (CI only) re-proves
  the same success/idempotency/cross-user paths against a real GoTrue-issued JWT and
  real PostgREST RPC call; it does not re-prove the active-challenge rejection case,
  since there is no client-reachable way yet to produce a real active challenge (that
  path is exercised at the Postgres level instead, directly against a fixture).
- **Must remain impossible from the client:** Any direct write to `challenges` or
  `consequences` (already proven — no grant); canceling another user's pending
  commitment; canceling an already-active or completed challenge; deleting any row.

## 3b. Trusted full activation

- **Trusted boundary:** A single server-side transaction — never the client — decides a
  pending commitment is ready to actually start and transitions it to `active`.
- **Tables/functions:** Updates the `challenges` row 3a already created with
  `activation_snapshot`, `activated_at`, `starts_at`, `planned_ends_at`, and `timezone`;
  a new trusted function (`activate_challenge_draft` or similar) does not exist yet. This
  is the remaining, still-unimplemented half of the original "Trusted atomic activation"
  phase — real payment authorization, period generation, and status become `active` only
  here, not in 3a.
- **Client responsibilities:** Trigger activation once the surrounding flow (payment
  method, recipient link, sharing) is real, and render the result.
- **Server responsibilities:** Re-validate readiness again at this later point (the
  underlying draft is gone by then — archived in 3a — so this reads from the
  `pending_activation` challenge instead), generate the immutable snapshot, and write it
  atomically together with `starts_at`/`planned_ends_at`/`timezone`.
- **Prerequisite product decisions:** Whether challenge start waits for sharing — still
  unresolved.
- **Minimum tests:** Atomicity under simulated partial failure; the immutability trigger
  (proven in `060_immutability_and_append_only.sql`) continues to block any later
  tampering with the snapshot it writes.
- **Must remain impossible from the client:** Any direct write to `challenges` (already
  proven — no grant); activating the same pending commitment twice; a fake active status
  without a real snapshot.

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
