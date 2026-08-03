# Initial Supabase schema

The initial migration is `supabase/migrations/20260803000000_initial_kinwin_schema.sql`.
It is version-controlled only; it does not configure or connect the mobile app to Supabase.

> **Pre-deployment requirement:** this migration has only received static review. Apply it first to
> a disposable local or development Supabase environment and exercise constraints, triggers, RLS,
> and grants with representative roles before any production deployment.

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

Clients receive no insert/update/delete grant or policy for `check_in_events`. A future trusted append
endpoint must validate event shape, ownership, challenge state, period membership, and idempotency.
Corrections reference an earlier event in the same challenge through a composite foreign key; old
events and Cut back totals are never overwritten as the source of truth.
The SQL event names `stop_intact` and `stop_lapse` are the relational forms of the TypeScript
`stop_status` discriminant, whose payload carries the corresponding status.

## Future trusted server work

- Draft-readiness review and atomic activation, including snapshot/recipient/consequence creation.
- Timezone- and DST-aware period generation.
- Validated, idempotent check-in append and correction handling.
- Versioned deterministic evaluation and challenge lifecycle transitions.
- Atomic Completion Mode transitions after entitlement synchronization.
- Payment authorization, idempotent charging, retries, and reward fulfillment.
- Invitation creation/delivery and a carefully scoped recipient-access mechanism.
- Audited administrative/manual-review and account-deletion workflows.

## Unresolved decisions

The unresolved decisions in `PRODUCTION_DATA_MODEL.md` still apply: timezone/DST rules, correction
and evidence policy, exact Cut back continuity evaluation, payment retry/grace behavior, recipient
replacement, start-versus-sharing timing, active-commitment account deletion, disputes/manual
review, external-organizer identity, and store entitlement integration. Public recipient access and
membership-history retention also remain intentionally undecided.
