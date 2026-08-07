# Check-in engine

This document describes the pure domain model in `domain/challenge/check-in/` and the
challenge-level evaluator in `domain/challenge/results.ts`. It is the write-up referenced from
those files' code comments.

**Scope.** This is a domain-engine package: pure functions that decide what check-in history
means and what a trusted write layer should do with a new check-in request. It is not the
Supabase write endpoint, not final challenge activation, and it does not perform IO. Its job is to
make the product rules internally coherent — correction semantics, idempotency, period reduction,
and success evaluation — before any of this is persisted and used to trigger a financial
consequence.

**What already existed vs. what this package adds.** The append-only shape was already locked at
the schema level: `supabase/migrations/20260803000000_initial_kinwin_schema.sql`'s
`check_in_events` table has DB triggers rejecting `UPDATE`/`DELETE` for every role including
`service_role`, a `correction_of_event_id` self-reference, and a per-challenge unique index on
`idempotency_key`. Period generation was already locked at
`supabase/migrations/20260809000000_server_generated_periods.sql`'s
`private.generate_challenge_periods`, the single authoritative timezone/DST boundary calculation.
What did not exist, and is genuinely new here, is the TypeScript side: a `CheckInEvent` shape that
actually matches the SQL `event_type` enum (the previous stub used a different, non-matching
correction mechanism — see "Correction semantics" below), a pure reducer from event history to
effective period state, an idempotency + correction-cutoff contract for a future write endpoint,
and a real `evaluateChallenge` for `build` and `stop` (previously a permanent stub). This package
does not redesign period generation, and does not implement a second, competing period-boundary
calculation — `ChallengePeriod` and `GeneratePeriods` in `domain/challenge/periods.ts` describe the
shape `private.generate_challenge_periods` already produces, nothing more.

## Event semantics

`domain/challenge/check-in/types.ts` defines `CheckInEvent` as a discriminated union matching
`check_in_events.event_type`: `build_completion`, `cut_back_total`, `stop_intact`, `stop_lapse`, or
`correction`. Every event carries a `CheckInFact` — the declarative content of what was reported.

**Declared values, not deltas.** `build_completion` carries `completions: number` — the current
total for that period — not "+1 for this tap." This is deliberately symmetric with
`cut_back_total`'s `total: number` and the two `stop_*` facts, which are inherently single-valued
(you either stayed intact or lapsed). The consequence is that all three directions reduce the same
way: **the latest valid event for a period is that period's effective fact.** Nothing about the
reducer needs to know "count taps minus retracted taps" as a special case for `build`. The cost of
this choice is that a client incrementing a build counter must resubmit the new total each time
(compute `previous + 1` client-side, or read the current effective fact first), not just emit "one
more." That is a deliberate trade for a uniform reduction model, not an oversight.

**Trust boundary.** Every event has `serverRecordedAt: IsoDateTime | null`. `null` means the event
has not yet been stamped by a trusted server clock — i.e. it exists only as a client's pending
write, not yet accepted. `reduceEffectiveFact` only folds server-timestamped events; anything else
is invisible to period reduction. Separately, `evaluateChallenge` refuses to produce a
challenge-level result at all (`events_awaiting_server_timestamp`) if *any* event in the input is
still unstamped, even for periods that don't need it — a conservative "the input set itself isn't
trustworthy yet" guard, distinct from the reducer's per-period filtering.

## Correction semantics

**The mismatch this reconciles.** The original stub had every event carry a generic
`correctsEventId`, plus cut-back events separately had a `supersedesEventId`. Neither matches the
actual SQL schema, which has exactly one correction mechanism: a dedicated `'correction'`
`event_type` row with `correction_of_event_id` pointing at the event it replaces. This package
adopts the SQL shape as authoritative. A correction is its own new, independent, append-only row —
it carries a full `CheckInFact` of its own (so the reducer never needs to "patch" an old fact), and
it never mutates or removes the row it corrects. The corrected row remains in history, visible,
untouched. This satisfies "show what was originally recorded, what replaced it, and when" without
hashes, signatures, or any anti-cheating machinery — Kinwin is accountability software, not a
fraud-proof verification service, and none of that was added.

**Idempotent retry vs. genuine correction — these are not the same thing.** A retry (double tap,
network resend) resubmits the *same* `ClientOperationId` with the *same* fact; it must be safely
repeatable and must not create a second event. A correction changes what was previously declared
for a period that already has an effective fact, and it must be explicitly flagged
(`CheckInAppendRequest.isCorrection: true` with a `correctionOfEventId`) — an unflagged second
declaration is rejected outright (`unflagged_redeclaration`) rather than silently treated as
"whatever, latest wins." This is what makes the period-closed correction cutoff meaningful: without
requiring the flag, there would be no way to distinguish "the client retried" from "the user is
trying to change their answer after the window."

**Correction cutoff.** While a period is open, its owner may correct their own check-in.
`planCheckInAppend` accepts a correction only if `now < periodEndsAt`; once the period has closed,
ordinary self-service correction is rejected (`period_closed_for_correction`). No support/admin
override flow is implemented in this package — the task explicitly excluded inventing one, and
none of the shipped types leave room for a correction to bypass this cutoff. A correction must also
target the currently-effective entry: `correctionOfEventId` is compared against the reducer's
current `winningEventId`, and a stale target is rejected (`correction_target_mismatch`) rather than
silently reordered or accepted against outdated history.

**Chains.** Multiple corrections in sequence are supported: each new correction targets whatever is
currently effective, so `original → correction A → correction B` is a normal, valid chain, and the
reducer folds it to `correction B`'s fact. A correction with no prior entry
(`correction_without_prior_entry`), or a second original event recorded for a period that already
has an effective fact, both fail the reduction safely (`ok: false`) rather than guessing — this is
the domain-level enforcement of "a correction must be explicit."

## Idempotency semantics

`ClientOperationId` (`CheckInAppendRequest.operationId`, maps to SQL's `idempotency_key`) is a
client-minted identifier for one logical operation, resubmitted verbatim on retry.
`planCheckInAppend` (`domain/challenge/check-in/append-plan.ts`) is the pure contract a trusted
write endpoint should follow:

- **Same operation ID + same payload** → `idempotent_replay`, referencing the existing event. Safe
  to call repeatedly; never creates a second row.
- **Same operation ID + a different/conflicting payload** → `rejected` with reason
  `operation_id_conflict`. Never silently produces a different result for a reused ID.
- **New operation ID, first declaration for the period** → `insert`.
- **New operation ID, flagged correction, valid target, period still open** → `insert` with
  `eventType: 'correction'`.

This function is pure and does no IO — it mirrors the existing "plan pattern" from
`lib/supabase/draft-mutation.ts` (decide the operation independent of IO, let a trusted layer
execute exactly that). The task explicitly said not to build the network endpoint unless a tiny
pure contract was clearly useful on its own; this is that contract, sized to be directly callable
from a future Postgres function or edge function without further design work, but it does not
itself touch Supabase.

## Effective-period reduction

`reduceEffectiveFact` (`domain/challenge/check-in/reduction.ts`) folds one period's event chain
into a single `EffectiveFact | null`. It:

1. Filters to server-timestamped events only.
2. Checks for `operationId` collisions with conflicting content (`findOperationIdConflict`) —
   this must fail before anything else, since a genuine collision means the history itself is
   untrustworthy.
3. Deduplicates legitimate retry pairs (same `operationId`, already proven to agree) down to one
   representative, so an idempotent retry does not look like "two originals" to the fold.
4. Orders the remainder by `serverRecordedAt`, then `id` as a tiebreaker.
5. Folds: a non-correction event is only valid as the very first entry for the period; a
   correction must target whatever is currently effective. Any other shape —a second original, an
   orphan correction, a correction targeting a superseded event — returns `ok: false` with a
   reason, rather than a guessed fact.

`derivePeriodState` (`domain/challenge/check-in/period-state.ts`) builds on this to produce
`EffectivePeriodState`, the period-level model:

| State | Meaning |
|---|---|
| `upcoming` | `now` is before the period's `startsAt`. |
| `open` | Period is running; carries whatever fact (if any) is currently effective. |
| `satisfied` | Period is closed and the effective fact met its target. |
| `not_satisfied` | Period is closed and the effective fact did not meet its target. |
| `closed_without_input` | Period is closed and no fact was ever effectively recorded. |

`closed_without_input` and `not_satisfied` are always kept distinct at the period level — silence
is never treated as an explicit failure report by this layer. (Where and how silence eventually
resolves into a binary challenge-level decision is a separate, one-layer-up concern; see
"No-response" below.) A fact whose shape doesn't match its period's target type (e.g. a
`stop_intact` fact reduced for a `completion_target` period) returns `ok: false` — a malformed
chain fails safely rather than producing a nonsensical comparison.

Period boundaries and target shapes are read directly from the already-generated
`ChallengePeriod` (`domain/challenge/periods.ts`), which mirrors exactly what
`private.generate_challenge_periods` writes to `challenge_periods` — including deliberately *not*
carrying `computed_status`/`is_closed`, since those are cached, derived output columns, not trusted
input to the evaluator that would otherwise produce them (an evaluator that reads its own stale
cache as input could never self-correct it).

## Challenge-level evaluation

`evaluateChallenge` (`domain/challenge/results.ts`) is the trusted, deterministic evaluator. It
takes a locked `ActivatedChallengeSnapshot`, the challenge's generated periods, and its check-in
events, and separates three distinct concerns that must never be collapsed into each other:

1. **What the user reported** — a `CheckInFact`, from event history.
2. **Effective period status** — `EffectivePeriodState`, from `derivePeriodState`.
3. **Challenge-level result** — `ChallengeEvaluation`, from this function.

No React component calculates challenge success; this is the only place that decision is made, and
it is a pure function of inputs, not of any mutable client state.

**Conservative-by-construction.** The evaluator never attempts an early or mid-challenge
determination via best-case/worst-case bounds. It only produces `success`/`failure` once *every*
period has closed; until then (and whenever anything about the input is untrustworthy or
unsupported) it returns `evaluable: false` with one or more typed `NotEvaluableReason`s and status
`pending`. This matches the previous stub's documented conservative philosophy and satisfies "a
challenge-level result stays pending while future periods exist."

**Build.** Two independent checks must both pass: an aggregate total (sum of
`Math.min(completions, period.target.target)` across periods, capped per period so one
over-completed period cannot "bank" surplus toward the aggregate — a deliberate modeling decision,
not a mechanical necessity) against `minimumRequiredCompletions`, and the existing continuity
safeguard (`maximum_consecutive_missed_days`, `maximum_consecutive_missed_weeks`, or
`minimum_completions_per_week`, all already defined in `SuccessRuleSnapshot`/`success-rule.ts` and
unchanged here). Both existing success-rule shapes are preserved and exercised by tests.

**Stop.** Single continuous period; the only reachable `lapseRule` in v1 is `zero_lapses`
(`domain/challenge/validation.ts` already rejects any non-zero `maximumLapses` at activation, so
`allowance` is unreachable for any validly-activated challenge). `stop_intact` → success,
`stop_lapse` → failure. `allowance` is guarded defensively (`unsupported_stop_lapse_rule`) rather
than implemented, since a single "latest fact wins" period cannot correctly count distinct lapse
occurrences across time — that would need a different reduction model than this package
implements, and no real challenge can exercise it today.

**Cut back.** See "Cut back continuity — unresolved" below; `evaluateChallenge` never returns a
trusted result for this direction.

## No-response — recommendation

A period can close with nobody ever having declared a fact (`closed_without_input`). This is kept
distinct from an explicit `not_satisfied` at the period level unconditionally — see above. Whether
that silence should count as failure at the *challenge* level is a genuine product/ethics decision,
isolated behind an explicit `NoResponsePolicy` parameter on `ChallengeEvaluationInput` rather than
hardcoded invisibly into the fold logic. Exactly one policy is implemented and used as the default:
`treat_as_not_satisfied`.

- For **build**, no policy is actually needed: silence for a period unambiguously means 0
  completions for that period, which is a known fact (not an inference), so it simply contributes
  0 toward the aggregate and breaks continuity like any other unmet period.
- For **stop**, silence at final closure is the one place the policy is load-bearing: under
  `treat_as_not_satisfied`, never checking in defaults to **failure**. The alternative (defaulting
  to success) would create a "never respond = automatic success" loophole for a zero-lapse
  promise, which directly undermines what the challenge is for. This is the recommended policy —
  founder sign-off is still requested since it directly affects accountability and eventually
  triggers a financial consequence, but no alternative policy is implemented, so
  `treat_as_not_satisfied` is what ships today.

No notifications, reminders, or nudging behavior are implemented in this package — out of scope by
the original task, and untouched here.

## Cut back continuity — unresolved

`docs/PRODUCTION_DATA_MODEL.md` already lists "the exact Cut back continuity safeguard" as an
unresolved decision, and `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 6 confirms `evaluateChallenge`
was a deliberate stub for this reason. This package does not resolve it. Instead:

- **The locked part**: an aggregate threshold — `minimumPeriodsWithinLimit` out of `totalPeriods`
  periods must have an effective total within the maximum — is already defined in
  `SuccessRuleSnapshot`'s cut-back shape and is exposed, read-only, via
  `computeCutBackAggregateOnly`. This function is introspection-only and is **never called by
  `evaluateChallenge`**.
- **The unresolved part**: whether a continuity safeguard (no more than N consecutive
  over-limit/no-response periods in a row — the same shape as build's already-locked continuity
  safeguard) also gates success, and if so, what N should be and how a `closed_without_input`
  period should count toward it. `recommendedCutBackContinuityCheck`
  (`domain/challenge/check-in/cut-back-continuity.ts`) implements one candidate answer — treating
  `closed_without_input` as "exceeded," on the theory that a run of silence during a cut-back
  challenge is at least as concerning as a reported over-limit total — but it is explicitly labeled
  **PENDING FOUNDER APPROVAL** and is not wired into the trusted evaluator.

**Why `evaluateChallenge` withholds even the aggregate-only result.** Even though the aggregate
threshold itself is locked, surfacing an aggregate-only success/failure for cut-back challenges
once periods close would risk being *wrong* — too lenient — the moment continuity is actually
decided, because a challenge that passes the aggregate count could still fail a not-yet-defined
continuity rule. Rather than silently invent a threshold or guess which product intent wins,
`evaluateChallenge` always returns `evaluable: false` with reason
`cut_back_continuity_policy_unresolved` for cut-back once its periods close. This is the one place
in the evaluator where "genuinely unresolved" is load-bearing to the trusted result, not
decorative.

**Example.** A 4-period cut-back challenge with `minimumPeriodsWithinLimit: 3`, periods
`[within, within, within, over]`: `computeCutBackAggregateOnly` reports
`satisfiedByAggregateAlone: true` (3 of 4 within limit). But if the founder locks a continuity rule
of "no more than 1 consecutive over-limit period," this same history still passes (only 1
consecutive over period). Contrast `[within, over, over, within]` with the same aggregate
(`minimumPeriodsWithinLimit: 3`... actually 2 within here, so aggregate already fails) — pick
instead `[within, within, over, over]` against `minimumPeriodsWithinLimit: 2`: aggregate passes (2
of 4 within), but a "no more than 1 consecutive over" rule would fail it. Until the founder locks
which of these is intended, `evaluateChallenge` cannot safely return either answer, so it returns
neither.

## What remains for the trusted Supabase write package

This package intentionally does not implement:

- The actual Supabase write endpoint/RPC that calls `planCheckInAppend` and persists its `insert`
  outcome as a real `check_in_events` row (this package only defines the pure contract that
  endpoint should follow).
- Wiring `evaluateChallenge`'s output back into `challenge_periods.computed_status`/`is_closed` or
  any `challenges` status column.
- The founder decision on Cut back continuity, and the corresponding switch from
  `cut_back_continuity_policy_unresolved` to a real `evaluable: true` result once decided.
- Founder sign-off on the no-response-for-stop policy (implemented as the only option, but still
  flagged for review given its consequence-triggering effect).
- Any support/admin override flow for corrections after period close.
- Stripe, membership, final challenge activation, consequence charging, Tremendous, social
  backend, or notifications — all explicitly out of scope, per the original task.

## Tests

Table-driven tests live alongside each module: `check-in/reduction.test.ts`,
`check-in/period-state.test.ts`, `check-in/append-plan.test.ts`, `check-in/cut-back-continuity.test.ts`,
and `results.test.ts`. Together they cover: first check-in, duplicate retry, conflicting
operation ID, correction while open, correction chains, attempted correction after close, orphan/
stale-target corrections failing safely, explicit success and failure for build/stop, no-response
at close for both build (implicit 0) and stop (policy-driven failure), daily/weekly/continuous
period kinds, a challenge-level result staying pending while a future period exists, cut-back's
aggregate-only introspection versus its withheld trusted result, and a malformed/inconsistent event
chain failing safely rather than producing a false success. Since period boundaries are consumed
as opaque already-generated ISO instants (never recomputed here), DST correctness is exercised only
by using a period pair with a genuinely non-24-hour boundary in the input fixtures, not by
reimplementing any timezone logic.
