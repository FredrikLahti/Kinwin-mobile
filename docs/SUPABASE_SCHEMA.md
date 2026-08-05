# Initial Supabase schema

The initial migration is `supabase/migrations/20260803000000_initial_kinwin_schema.sql`.
It is version-controlled only; it does not configure or connect the mobile app to Supabase.

> **Validation status:** this migration has been applied, reset, and reapplied against a disposable
> local Postgres 16 database (not a hosted or full local Supabase stack) with a minimal stand-in for
> the platform-managed `auth.users`/`auth.uid()` surface. `supabase/tests/` exercises schema
> creation, RLS as anonymous/owner/non-owner/service_role, the activation-snapshot immutability
> trigger, append-only enforcement on `check_in_events`, and representative valid/invalid records
> for every table's constraints — see `supabase/tests/README.md` for exact results and the
> stub's precise scope. It has **not** been exercised against Supabase's own GoTrue/PostgREST
> layer (JWT issuance and parsing, PostgREST's own grant/column enforcement, Storage/Realtime
> interaction). Apply it to a disposable hosted or full local Supabase project and re-run
> equivalent checks there before any production deployment.

## Boundary and ownership

`public` contains client-readable application records protected by RLS. The authenticated owner may
manage only `profiles` and normalized `challenge_drafts`; all activated/runtime/entitlement records
are read-only to the client. `private` contains opaque provider references, charge attempts, and
reward fulfillment operations. `anon` and `authenticated` have neither schema nor object access to
`private`. No provider secrets belong in either schema.

Auth ownership always uses `auth.users.id` and `(select auth.uid())`, never user-editable JWT
metadata. Restrictive foreign keys intentionally prevent account deletion from cascading through an
active financial commitment. A future trusted account-deletion workflow must resolve those records.

## Tables and domain mapping

| Table | Purpose / domain home |
| --- | --- |
| `profiles` | One application profile per Auth user. |
| `challenge_drafts` | Editable normalized `ChallengeDraft` JSON plus relational owner/version/status. Raw UI state is excluded. |
| `challenges` | Lifecycle/result status and immutable `ActivatedChallengeSnapshot` JSON plus query-critical activation metadata. |
| `challenge_recipients` | Ordered, queryable recipient names and recipient-organizer role. The snapshot remains authoritative. |
| `challenge_periods` | Trusted day/week/continuous windows, structured target payload, and computed period status. |
| `check_in_events` | Append-only Build, Cut back, Stop, and correction event payloads. |
| `consequences` | Client-readable consequence, authorization, stake, and currency summary. |
| `invitations` | Invitation lifecycle only; no public token or anonymous access. |
| `memberships` | Current membership status and `full`/`completion`/`none` access mode. |
| `private.consequence_provider_references` | Opaque payment-provider object references. |
| `private.consequence_charge_attempts` | Idempotent, durable charge-attempt history. |
| `private.reward_fulfillments` | Reward-provider request and delivery history. |

Organizer details, complete structured success rules, the completion definition, accepted stake,
currency, sit-out acknowledgement, recipients, and membership-at-activation remain inside
`activation_snapshot`. Relational copies exist only when needed for authorization or common queries;
the immutable snapshot is the commitment source of truth.

`memberships` represents current entitlement only. Immutable entitlement history should later be
captured from trusted provider events or a separate history table before synchronization is built.
Completion Mode is represented by both membership `access_mode = 'completion'` and the challenge
lifecycle transition to `completion_mode`; a future trusted transaction must keep them consistent.
The same trusted activation/charging transactions must keep stake and currency consistent between
the immutable snapshot, public consequence summary, and every private charge or fulfillment row.
The database deliberately does not let a client write any of those copies, but this migration does
not yet add premature cross-table JSON triggers.

## Access matrix

| Actor | Draft/profile writes | Activated/runtime reads | Activated/runtime writes | Private finance |
| --- | --- | --- | --- | --- |
| Owner client | Own profile and own drafts only | Own records only | None | None |
| Anonymous recipient | None | None (future access unresolved) | None | None |
| Trusted backend (`service_role`) | As required | As required | Required future validated operations | Required operational access |
| Administrative/manual review | No client policy; future audited server tooling only | Future audited tooling | Future controlled workflow | Future controlled workflow |

All public tables have RLS. There are no anonymous policies and no broad `using (true)` policies.
Explicit grants mirror the policies: authenticated clients can write profiles/drafts and can only
select the other public tables.

## Immutability and append-only history

Once a challenge has activation metadata or an active/completed status, a trigger rejects changes
to the snapshot, owner, activation/start/end timestamps, timezone, and schema/engine versions. It
does not block trusted updates to lifecycle status, `completed_at`, or other mutable operational
columns.

Clients receive no insert/update/delete grant or policy for `check_in_events`. Beyond that client
boundary, `check_in_events` is also append-only for every role including the trusted `service_role`:
a trigger unconditionally rejects `UPDATE` and `DELETE`, so a bug in future trusted server code
cannot silently edit or remove recorded history the way it still could for a table protected only by
grants. A future trusted append endpoint must validate event shape, ownership, challenge state,
period membership, and idempotency before inserting. Corrections reference an earlier event in the
same challenge through a composite foreign key that rejects cross-challenge references; old events
and Cut back totals are never overwritten as the source of truth.
The SQL event names `stop_intact` and `stop_lapse` are the relational forms of the TypeScript
`stop_status` discriminant, whose payload carries the corresponding status.

`supabase/migrations/20260807000000_archived_draft_immutability.sql` applies the same
"immutable for every role, not just the client" principle to `challenge_drafts`: once
`draft_status = 'archived'` (the state `prepare_challenge_from_draft` leaves a draft in),
a trigger unconditionally rejects `UPDATE` and `DELETE`, even though the owner's own
grants on that table are not themselves scoped to `draft_status`. Without it, a stale
client session still holding an already-prepared draft's id could silently rewrite or
remove the row a pending commitment's read-only summary is sourced from, while the
separately-created `challenge_recipients`/`consequences` rows stayed exactly as they
were — breaking the "no longer editable" rule without touching any of the tables that
actually represent the commitment.

## Trusted RPCs

`supabase/migrations/20260805000000_prepare_challenge_from_draft.sql` adds
`public.prepare_challenge_from_draft(draft_id uuid)`, a `SECURITY DEFINER` function with a
fixed `search_path` and `EXECUTE` granted only to `authenticated`. It is the only way a
`challenges`/`challenge_recipients`/`consequences` row can come from client action: those
tables still have no client `INSERT`/`UPDATE` grant at all. Given a draft id, it requires a
real `auth.uid()`, loads the draft from the database (never from client-supplied contents),
verifies ownership and `draft_status = 'ready_for_activation'`, revalidates every required
commitment field server-side, and atomically creates one `challenges` row with
`challenge_status = 'pending_activation'` (no `activation_snapshot`, timestamps, or timezone —
those stay null), its `challenge_recipients`, and one `consequences` row in the honest
pre-payment state `'payment_method_required'`, then archives the source draft. A unique
partial index on `challenges.source_draft_id` plus an in-function idempotency check make
repeated preparation of the same draft return the same challenge rather than duplicating it.
It never creates membership, payment authorization, challenge periods, invitations, or an
active status — see "Future trusted server work" below for those.
See `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3a for client wiring and test coverage.

`supabase/migrations/20260808000000_one_pending_commitment_per_owner.sql` (added in
review) adds a second unique partial index, `challenges_owner_one_pending_idx` on
`challenges (owner_id) where challenge_status = 'pending_activation'`, and updates
`prepare_challenge_from_draft` to check for and reject preparing a draft while the owner
already has a different pending commitment — a user may only ever have one at a time.

`supabase/migrations/20260806000000_cancel_pending_challenge.sql` adds
`public.cancel_pending_challenge(challenge_id uuid)`, the same `SECURITY DEFINER` /
fixed-`search_path` / `authenticated`-only-`EXECUTE` shape. It is the only way
`challenge_status`/`consequences.status` can reach `'canceled_before_activation'` from
client action. Requires a real `auth.uid()`, verifies ownership, allows the transition
only from `pending_activation` (an already-canceled challenge returns the same result
idempotently instead of erroring; anything else — including an already-`active` or
completed challenge — is rejected), and atomically updates both the challenge and its
consequence. Deletes nothing: the challenge, its recipients, its consequence, and the
already-archived source draft all survive, unchanged apart from those two status
columns. See `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3a-ii for client wiring and
test coverage.

`supabase/migrations/20260809000000_server_generated_periods.sql` adds
`private.generate_challenge_periods(p_challenge_id uuid, p_activation_instant timestamptz,
p_timezone text)` — a `SECURITY DEFINER` function in the `private` schema (not `public`),
with `EXECUTE` granted only to `service_role`; `anon` and `authenticated` cannot reach it
at all, since `private` is neither PostgREST-exposed nor `USAGE`-granted to either role.
Designed to be called from the future full-activation transaction
(`docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3b), never directly by the client. Given a
pending challenge id, an activation instant, and an IANA timezone, it validates the
timezone against the server's own tzdata, requires the challenge to be
`pending_activation` (rejecting canceled/active/completion_mode/completed challenges),
loads the rule and duration from the immutable archived source draft (never from a
parameter — the caller cannot supply rule content), and atomically creates every
`challenge_periods` row: one per local calendar day for a daily Build rhythm or a
day-boundary Cut back rule, one per rolling seven-local-day challenge week for a
weekly_count/specific_days Build rhythm or a week-boundary Cut back rule, or one
continuous row for a Stop challenge. `starts_at` is the next local midnight strictly
after the activation instant; `planned_ends_at` is `duration.value` whole local weeks
later; every individual boundary is computed from local-naive timestamp arithmetic and
converted to a UTC instant separately, so a day or week containing a DST transition
correctly spans 23 or 25 UTC hours while every boundary still lands on true local
midnight. A companion table, `private.challenge_period_generations`, records what a
challenge was actually generated with, so an identical repeated call (same instant and
timezone) returns the same result, and a conflicting repeat (different instant or
timezone) is rejected rather than silently replacing periods. It does not change
`challenge_status` or populate `activation_snapshot`/`activated_at`/`starts_at`/
`planned_ends_at`/`timezone` on `challenges` — that remains phase 3b's job. See
`docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 4 for details and test coverage, and
`docs/PRODUCT_DECISIONS.md`'s "Timezone, start, and DST rules" section for the finalized
product rules this implements.

`supabase/migrations/20260810000000_consequence_setup_stripe.sql` adds three RPCs for
the Stripe test-mode payment-method-setup foundation:
`public.prepare_consequence_setup(p_owner_id, p_challenge_id, p_consequence_id)`,
`public.record_consequence_setup_attempt(p_owner_id, p_challenge_id,
p_stripe_customer_id, p_stripe_setup_intent_id)`, and
`public.apply_consequence_setup_event(p_stripe_event_id, p_event_type,
p_stripe_setup_intent_id, p_stripe_customer_id, p_stripe_payment_method_id, p_status)`.
Unlike `private.generate_challenge_periods` above, these live in `public` rather than
`private` — PostgREST (and therefore an Edge Function calling them through the
service-role Supabase client's `.rpc()`) can only reach functions in an exposed schema,
and `private` deliberately is not one. Living in `public` does not make them reachable
by `anon`/`authenticated`: `EXECUTE` is granted only to `service_role`, the same
grant-restriction pattern `prepare_challenge_from_draft`/`cancel_pending_challenge`
already use (there restricted to `authenticated` instead, since those are called
directly by the client). The tables they read and write —
`private.stripe_customers`, `private.consequence_setup_attempts`,
`private.stripe_webhook_events`, and the pre-existing
`private.consequence_provider_references` — stay in `private`; being `security
definer`, the functions can reach them regardless of the caller's own grants, so no
client role gains any new access to `private` itself.

The two callers of these RPCs are Supabase Edge Functions, not the client directly:
`supabase/functions/create-consequence-setup-intent` (requires a real Supabase user
JWT; derives the caller from it, never the request body; calls `prepare_consequence_setup`
then, after creating or reusing a Stripe Customer/SetupIntent, `record_consequence_setup_attempt`)
and `supabase/functions/stripe-consequence-webhook` (Supabase JWT verification disabled
for this one function only — `verify_jwt = false` in `supabase/config.toml` — since
Stripe signs its own requests with an HMAC secret instead; verifies that signature
before trusting anything in the body, then calls `apply_consequence_setup_event`). See
`docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 8 and `docs/PAYMENT_SETUP.md` for the full
flow, security properties, and local testing instructions.

## Future trusted server work

- Full activation of an already-prepared `pending_activation` challenge: the immutable
  `activation_snapshot`, `activated_at`/`starts_at`/`planned_ends_at`, and timezone, plus
  real (not pre-activation) payment authorization and a call to
  `private.generate_challenge_periods` with the chosen activation instant and timezone
  (`docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3b).
- Validated, idempotent check-in append and correction handling.
- Versioned deterministic evaluation and challenge lifecycle transitions.
- Atomic Completion Mode transitions after entitlement synchronization.
- Idempotent charging (only after trusted evaluation reaches `failure`), payment
  retries, and reward fulfillment — payment-method setup itself is implemented (see
  above), charging is not.
- Invitation creation/delivery and a carefully scoped recipient-access mechanism.
- Audited administrative/manual-review and account-deletion workflows.

## Unresolved decisions

The unresolved decisions in `PRODUCTION_DATA_MODEL.md` still apply: correction and evidence policy,
exact Cut back continuity evaluation, payment retry/grace behavior, recipient replacement,
start-versus-sharing timing, active-commitment account deletion, disputes/manual review,
external-organizer identity, and store entitlement integration. Public recipient access and
membership-history retention also remain intentionally undecided. Timezone/DST period-generation
rules are now resolved — see `docs/PRODUCT_DECISIONS.md`'s "Timezone, start, and DST rules" section.
