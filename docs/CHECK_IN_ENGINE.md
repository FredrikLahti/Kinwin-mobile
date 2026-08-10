# Check-in engine

> Production lifecycle note: migration `20260821000000_server_scheduled_challenge_completion.sql` and the service-only `scheduled-finalize-challenges` Edge Function run this deterministic evaluator on a 15-minute server schedule after the final persisted reporting deadline. App launch is no longer required for eventual terminal success/failure. This remains outcome determination only; payment and reward fulfillment are separate and are not invoked. See `docs/SCHEDULED_CHALLENGE_COMPLETION.md`.

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
actually matches the SQL `event_type` enum, a pure reducer from event history to effective period
state, an idempotency + reporting-window contract for a future write endpoint, and a real
`evaluateChallenge` for all three directions. This package does not redesign period generation, and
does not implement a second, competing period-boundary calculation — `ChallengePeriod` and
`GeneratePeriods` in `domain/challenge/periods.ts` describe the shape
`private.generate_challenge_periods` already produces, plus one addition (`reportingClosesAt`, see
"Reporting window" below).

**Founder-locked in this revision.** Four product decisions that shipped as isolated,
not-wired-in recommendations in the first version of this package are now locked and load-bearing
in the trusted evaluator: Stop's sticky-lapse reduction (not "latest fact wins"), the
tracking-end/reporting-deadline split, the no-response-means-not-satisfied policy applied
consistently across all three directions, and Cut back's continuity safeguard. Each is covered in
its own section below.

## Event semantics

`domain/challenge/check-in/types.ts` defines `CheckInEvent` as a discriminated union matching
`check_in_events.event_type`: `build_completion`, `cut_back_total`, `stop_intact`, `stop_lapse`, or
`correction`. Every event carries a `CheckInFact` — the declarative content of what was reported.

**Declared values, not deltas — for build and cut_back.** `build_completion` carries
`completions: number` — the current total for that period — not "+1 for this tap." This is
deliberately symmetric with `cut_back_total`'s `total: number`. The consequence is that both
directions reduce the same way: **the latest valid event for a period is that period's effective
fact.** The cost of this choice is that a client incrementing a build counter must resubmit the new
total each time (compute `previous + 1` client-side, or read the current effective fact first), not
just emit "one more." That is a deliberate trade for a uniform reduction model, not an oversight.

**Stop is not a declared-value reduction — see "Stop's sticky-lapse semantics" below.** The two
`stop_*` facts look single-valued the same way `cut_back_total` does, but they are not folded the
same way: a later `stop_intact` must never erase an earlier valid `stop_lapse`, which rules out
"latest fact wins" for this direction specifically.

**Trust boundary.** Every event has `serverRecordedAt: IsoDateTime | null`. `null` means the event
has not yet been stamped by a trusted server clock — i.e. it exists only as a client's pending
write, not yet accepted. `reduceEffectiveFact`/`resolveStopHistory` only fold server-timestamped
events; anything else is invisible to period reduction. Separately, `evaluateChallenge` refuses to
produce a challenge-level result at all (`events_awaiting_server_timestamp`) if *any* event in the
input is still unstamped, even for periods that don't need it — a conservative "the input set
itself isn't trustworthy yet" guard, distinct from the reducer's per-period filtering.

## Reporting window: tracking end vs. reporting deadline (locked)

`ChallengePeriod` (`domain/challenge/periods.ts`) carries two distinct trusted boundaries:

- `endsAt` — the **tracking** boundary: when the behavior itself stops being observed.
- `reportingClosesAt` — a separate, later **reporting/correction deadline**: the self-service
  window by which a first report or a correction must be submitted before the period is treated as
  finally decided.

These were previously conflated (`period.endsAt` doubled as both), which produced a genuine
inconsistency: a first declaration could be accepted arbitrarily late (no deadline existed for it
at all), while an immediate correction was blocked the instant `endsAt` passed. Both are now gated
by the same field, `reportingClosesAt`:

- A new report may be accepted until `reportingClosesAt`.
- A correction may be accepted until `reportingClosesAt`.
- After that deadline, neither is accepted (`planCheckInAppend` returns `reporting_deadline_passed`
  for both cases).
- An idempotent replay of an operation already accepted before the deadline remains safe after the
  deadline — the same-`operationId` check runs before the deadline check in
  `check-in/append-plan.ts`, so a resubmitted retry never starts failing just because time passed.
- `derivePeriodState` (`check-in/period-state.ts`) does not finalize a period — does not commit to
  `satisfied` / `not_satisfied` / `closed_without_input` — until `reportingClosesAt` has passed,
  even if tracking (`endsAt`) ended long before. Before that, the period stays `open`.
  `evaluateChallenge` therefore cannot finalize a no-response period before its reporting deadline
  has passed either, since it only proceeds once every period is closed.

**This package does not choose a duration** for the gap between `endsAt` and `reportingClosesAt` —
no hardcoded 12/24/48-hour rule lives here. The later activation/check-in write package must
determine and persist the actual `reportingClosesAt` for every period; this package only defines
what the domain rules do with it once supplied, and no migration was added here to persist it (the
field does not yet exist on `challenge_periods` in SQL).

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
for build/cut_back, and it must be explicitly flagged (`CheckInAppendRequest.isCorrection: true`
with a `correctionOfEventId`) — an unflagged second declaration for build/cut_back is rejected
outright (`unflagged_redeclaration`) rather than silently treated as "whatever, latest wins."

**Correction cutoff.** While a period is still within its reporting window (`now < reportingClosesAt`
— see "Reporting window" above), its owner may correct their own check-in.
`planCheckInAppend` accepts a correction only until that deadline; once it has passed, ordinary
self-service correction is rejected (`reporting_deadline_passed`). No support/admin override flow is
implemented in this package. A correction must also target a currently-valid entry: for
build/cut_back, `correctionOfEventId` is compared against the reducer's current `winningEventId`;
for Stop, it is checked against `resolveStopHistory`'s `validCorrectionTargets` (see below, since
Stop can have several independent, simultaneously-live chains). A stale target is rejected
(`correction_target_mismatch`) rather than silently reordered or accepted against outdated history.

**Chains.** Multiple corrections in sequence are supported: each new correction targets whatever is
currently effective for its own lineage. A correction with no prior entry
(`correction_without_prior_entry`), or (for build/cut_back) a second original event recorded for a
period that already has an effective fact, both fail the reduction safely (`ok: false`) rather than
guessing — this is the domain-level enforcement of "a correction must be explicit."

## Idempotency semantics — challenge-scoped, not period-scoped

`ClientOperationId` (`CheckInAppendRequest.operationId`, maps to SQL's `idempotency_key`) is a
client-minted identifier for one logical operation, resubmitted verbatim on retry.
`check_in_events.idempotency_key` is unique **per challenge**, not per period — so
`planCheckInAppend` (`domain/challenge/check-in/append-plan.ts`) takes the operation-id lookup as
its own, separate, challenge-scoped input, distinct from period-local history:

```ts
planCheckInAppend(
  request: CheckInAppendRequest,
  existingEventsForPeriod: readonly CheckInEvent[],   // period-local — reduction/correction semantics only
  existingEventForOperationId: CheckInEvent | null,   // challenge-scoped — the idempotency check only
  context: { now: IsoDateTime; period: ChallengePeriod },
): CheckInAppendPlan
```

**The bug this fixes.** An earlier revision searched for a reused operation id only inside
`existingEventsForPeriod`. Since the SQL uniqueness constraint is challenge-wide, an operation id
reused across two *different* periods of the same challenge would never be found by a period-local
search — the pure contract would plan a normal insert for what the database would actually reject
as a duplicate key, pushing detection onto a later database exception instead of this contract
catching it as its ordinary, expected behavior.

**The contract now requires:**

- Operation id unused anywhere in the challenge (`existingEventForOperationId: null`) → continue
  normal planning against period-local history, as before.
- Operation id already used for the **same logical operation** → `idempotent_replay`, referencing
  the existing event. Safe to call repeatedly, including after the reporting deadline.
- Operation id reused for **a different period** of the same challenge → `operation_id_conflict`.
- Operation id reused with a **conflicting fact, event type, or correction target** — even within
  the same period — → `operation_id_conflict`. Never silently produces a different result for a
  reused id.

"Same logical operation" is defined by matching every part of the persisted semantic identity:
challenge, period, event type (or `correction`), the declared fact, and — for a correction — its
target (`requestMatchesEvent` in `append-plan.ts`).

**This must never be treated as a corner case a database unique-constraint exception happens to
catch later** — it is this pure contract's normal, expected behavior. The future trusted write
endpoint should mirror the same two-step shape this contract expects: resolve
`(challenge_id, idempotency_key)` challenge-wide **first** — a single lookup against the whole
challenge — before loading and touching any period-local history.

This function is pure and does no IO — it mirrors the existing "plan pattern" from
`lib/supabase/draft-mutation.ts`. It does not itself touch Supabase; no network write endpoint was
built in this package.

## Effective-period reduction

Build and cut_back use `reduceEffectiveFact` (`domain/challenge/check-in/reduction.ts`), which folds
one period's event chain into a single `EffectiveFact | null`:

1. Filters to server-timestamped events only.
2. Checks for `operationId` collisions with conflicting content (`findOperationIdConflict`).
3. Deduplicates legitimate retry pairs down to one representative.
4. Orders the remainder by `serverRecordedAt`, then `id` as a tiebreaker.
5. Folds: a non-correction event is only valid as the very first entry for the period; a correction
   must target whatever is currently effective. Any other shape fails safely (`ok: false`).

### Stop's sticky-lapse semantics (locked)

Stop uses a **different** reducer, `resolveStopHistory`
(`domain/challenge/check-in/stop-reduction.ts`), because "latest fact wins" is the wrong model for
a zero-lapse promise:

- `stop_intact` is an attestation that the user was still intact **as of that check-in** — a
  point-in-time claim, not a standing state.
- `stop_lapse` records that a lapse occurred. It is a fact about a moment that already happened; it
  does not become false just because the user later pings `stop_intact` again.
- A genuine, uncorrected lapse is **absorbing**: once recorded, it dominates the period's outcome
  regardless of any later ordinary `stop_intact` attestation.
- Only an explicit `correction` event whose `correctionOfEventId` names that specific lapse (or a
  correction of it) can remove it from the effective lapse history — e.g. the user accidentally
  tapped the wrong answer and corrects it.
- Repeated ordinary `stop_intact` attestations are valid, expected history — each is its own
  independent entry, never implicitly treated as a correction of the previous one, and
  `planCheckInAppend` accepts them without requiring `isCorrection: true` (Stop is the one
  direction where a second non-correction declaration for the same period is normal, not an
  `unflagged_redeclaration`).

Concretely, `resolveStopHistory` treats every original `stop_intact`/`stop_lapse` event as the root
of its own correction chain (walked forward via `correctionOfEventId`, same append-only-correction
mechanics as build/cut_back), then asks two independent questions of the resulting set of effective
per-chain facts:

- **`hasUncorrectedLapse`** — does any chain's effective fact remain `stop_lapse`? If so, the period
  is `not_satisfied`, full stop, regardless of anything else in the history.
- **`hasFinalIntactAttestation`** — does an ordinary, root `stop_intact` declaration exist — still
  currently effective (its chain's terminal fact is still `stop_intact`) — whose **own** trusted
  timestamp falls inside `[period.endsAt, period.reportingClosesAt)`? A Stop challenge may not
  succeed merely because an old `stop_intact` event exists from earlier in the challenge; it needs
  an appropriate **final** attestation once tracking is actually over. If there's no uncorrected
  lapse and this final attestation exists, the period is `satisfied`. If neither condition is met
  (e.g. an early ping followed by silence through the deadline), the period is
  `closed_without_input` — not automatically a failure at the period level, but resolved into one
  at the challenge level by the locked no-response policy below.

  **A correction's own timestamp never counts here, on either side.** `ChainEntry` (in
  `stop-reduction.ts`) keeps a root declaration's own event type and own trusted timestamp separate
  from its chain's terminal (correction-resolved) fact and timestamp — the two were conflated in an
  earlier revision, which let a correction's timestamp accidentally qualify as the final
  attestation: an early accidental `stop_lapse`, corrected to `stop_intact` sometime after tracking
  ended, would wrongly look like a final attestation purely because the *correction* landed inside
  the window. A correction answers "what was the truth of the event I am correcting?" — it is not
  itself a new current-status attestation. Concretely: correcting an old lapse to intact removes it
  from `hasUncorrectedLapse`, but only a *separate*, ordinary root `stop_intact` declaration whose
  own timestamp falls in the window can satisfy `hasFinalIntactAttestation`. Symmetrically, an
  ordinary final `stop_intact` declaration that is later corrected to `stop_lapse` no longer
  qualifies either — its chain's terminal fact is `stop_lapse`, which also makes it absorbing via
  `hasUncorrectedLapse`.

## `EffectivePeriodState`

`derivePeriodState` (`domain/challenge/check-in/period-state.ts`) produces the period-level model,
routing to the generic reducer for build/cut_back and to `resolveStopHistory` for Stop
(`target.type === 'maximum_lapses'`):

| State | Meaning |
|---|---|
| `upcoming` | `now` is before the period's `startsAt`. |
| `open` | `now` is before `reportingClosesAt` — still accepting a first report or a correction; carries whatever fact (if any) is currently effective, informational only. |
| `satisfied` | The reporting deadline has passed and the effective fact/history met its target. |
| `not_satisfied` | The reporting deadline has passed and the effective fact/history did not meet its target (or, for Stop, an uncorrected lapse exists). |
| `closed_without_input` | The reporting deadline has passed and no qualifying fact was ever effectively recorded. |

`closed_without_input` and `not_satisfied` are always kept distinct at the period level — silence is
never treated as an explicit failure report by this layer. (Where and how silence resolves into a
binary challenge-level decision is a separate, one-layer-up concern; see "No-response" below.) A
fact whose shape doesn't match its period's target type returns `ok: false` — a malformed chain
fails safely rather than producing a nonsensical comparison.

Period boundaries and target shapes are read directly from the already-generated `ChallengePeriod`
(`domain/challenge/periods.ts`), which mirrors what `private.generate_challenge_periods` writes to
`challenge_periods`, plus `reportingClosesAt` (see "Reporting window" above) — including
deliberately *not* carrying `computed_status`/`is_closed`, since those are cached, derived output
columns, not trusted input to the evaluator that would otherwise produce them.

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
period has closed (which itself cannot happen before that period's `reportingClosesAt` — see
above); until then it returns `evaluable: false` with one or more typed `NotEvaluableReason`s and
status `pending`.

**Build.** Two independent checks must both pass: an aggregate total (sum of
`Math.min(completions, period.target.target)` across periods, capped per period so one
over-completed period cannot "bank" surplus toward the aggregate) against
`minimumRequiredCompletions`, and the existing continuity safeguard
(`maximum_consecutive_missed_days`, `maximum_consecutive_missed_weeks`, or
`minimum_completions_per_week`).

**Stop.** Single continuous period; the only reachable `lapseRule` in v1 is `zero_lapses`
(`domain/challenge/validation.ts` already rejects any non-zero `maximumLapses` at activation, so
`allowance` is unreachable for any validly-activated challenge and is guarded defensively with
`unsupported_stop_lapse_rule`). The period's state was already resolved by the sticky-lapse rules
above; `evaluateStop` reads that result the same way the other two directions do — `satisfied` →
success, `not_satisfied` → failure, `closed_without_input` → the locked no-response policy.

**Cut back.** Locked as of this revision — see "Cut back continuity" below.

## No-response policy (locked)

A period can close with nobody ever having declared a fact (`closed_without_input`). This stays
distinct from an explicit `not_satisfied` at the period level unconditionally — see above. The
recorded truth is always "no input was received"; whether that counts against the user at the
*challenge* level is a separate product-consequence decision, made once:

> **Locked V1 rule:** once a period's reporting deadline has passed with no required final report,
> that period is deemed **not satisfied** for challenge-result purposes. Applied consistently
> across build, cut_back, and stop.

- For **build**, the audit truth is still "no input was received" — this package never fabricates
  an explicit zero-completion event and never claims to know that zero completions occurred. The
  locked policy is what determines the *result consequence*: a `closed_without_input` period is
  deemed not satisfied, contributes no completion credit toward the aggregate, and breaks
  continuity the same way an explicit unmet period does.
- For **cut_back**, a `closed_without_input` period counts as "exceeded" for both the aggregate
  `minimumPeriodsWithinLimit` count (it is not counted as within-limit) and the continuity
  safeguard (it counts as an exceeded period in a consecutive run) — see below.
- For **stop**, this is the one place the policy is fully load-bearing: no final intact attestation
  within the reporting window defaults to **failure**, not success. The alternative (defaulting to
  success) would create a "never respond = automatic success" loophole for a zero-lapse promise.

Before a period's reporting deadline has passed, the challenge-level result stays `pending`
regardless of this policy — it only applies to periods that are actually closed.

No notifications, reminders, or nudging behavior are implemented in this package — out of scope by
the original task, and untouched here.

## Cut back continuity (locked)

Previously unresolved (`docs/PRODUCTION_DATA_MODEL.md` listed "the exact Cut back continuity
safeguard" under unresolved decisions, and `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 6 confirmed
`evaluateChallenge` was a deliberate stub for this reason). This revision locks and wires it in:

> **Locked V1 rule:** a cut_back challenge succeeds only if **both**:
> 1. the aggregate threshold is met — `minimumPeriodsWithinLimit` out of `totalPeriods` periods had
>    an effective total within the maximum;
> 2. the continuity safeguard is met — no more than N consecutive exceeded periods in a row, using
>    the safeguard `deriveSuccessRuleForChallengeRule` already emits per cadence:
>    `maximum_consecutive_exceeded_days` (maximum 2) for daily cut_back, or
>    `maximum_consecutive_exceeded_weeks` (maximum 1) for weekly cut_back.
>
> A period counts as "exceeded" for the continuity run if it is `not_satisfied` (an explicit
> over-limit report) **or** `closed_without_input` (no required report at all) — silence breaks the
> streak the same way an over-limit report does, consistent with the locked no-response policy
> above. A `satisfied` (within-limit) report breaks the run back to zero.

`cutBackContinuityCheck` (`domain/challenge/check-in/cut-back-continuity.ts`) computes the longest
consecutive exceeded run against the rule's own `continuitySafeguard`; `evaluateChallenge`'s
`evaluateCutBack` combines that with the aggregate count and requires both. Neither check alone is
the trusted result — an aggregate pass with a continuity violation is a failure, and vice versa.

**Example.** A 4-period cut_back challenge with `minimumPeriodsWithinLimit: 1` and
`maximum_consecutive_exceeded_days` (maximum 2): `[within, over, over, over]` meets the aggregate
(1 ≥ 1) but the trailing run of three exceeded periods (3 > 2) violates continuity — **failure**.
`[within, over, over, within]` meets both (aggregate: 1 ≥ 1; longest run: 2 ≤ 2) — **success**. This
is exactly the gap the previous, withheld-result version of this package could not safely resolve
on its own — the aggregate-only figure alone would have called both of these "passing."

## What remains for the trusted Supabase write package

This package intentionally does not implement:

- The actual Supabase write endpoint/RPC that calls `planCheckInAppend` and persists its `insert`
  outcome as a real `check_in_events` row.
- A migration adding `reporting_closes_at` (or equivalent) to `challenge_periods` — the later
  activation/check-in package must determine and persist the actual reporting-window duration and
  supply it as this package's trusted `reportingClosesAt` input.
- Wiring `evaluateChallenge`'s output back into `challenge_periods.computed_status`/`is_closed` or
  any `challenges` status column.
- Any support/admin override flow for corrections after the reporting deadline.
- Stripe, membership, final challenge activation, consequence charging, Tremendous, social
  backend, or notifications — all explicitly out of scope, per the original task.

## Tests

Table-driven tests live alongside each module: `check-in/reduction.test.ts`,
`check-in/period-state.test.ts`, `check-in/append-plan.test.ts`, `check-in/cut-back-continuity.test.ts`,
and `results.test.ts`. Together they cover: first check-in, duplicate retry, conflicting operation
ID, correction within the reporting window, correction chains, attempted correction/first-report
after the reporting deadline (and an idempotent replay still succeeding after it), orphan/
stale-target corrections failing safely, Stop's sticky-lapse cases (final intact attestation
succeeds; an early-only ping followed by silence fails; a lapse followed by a later ordinary intact
still fails; an accidental lapse explicitly corrected then finally attested succeeds; repeated
ordinary intact attestations are valid, not corrections), the correction-vs-final-attestation
regression (an early lapse corrected to intact *after* tracking ends is not itself a final
attestation without a separate ordinary declaration; that separate declaration does succeed; an
ordinary final intact later corrected to a lapse no longer qualifies), cross-period operation-id
reuse (`operation_id_conflict`, not a false replay, even when period-local history alone would miss
it — including a conflicting event type across periods, and a same-period/same-fact reuse still
replaying safely independent of period-local history), explicit success and failure for build/
cut_back/stop, no-response at close for build (contributes no completion credit, without claiming
zero completions are known to have occurred), cut_back (counts as exceeded toward continuity), and
stop (policy-driven failure), daily/weekly/continuous period kinds, a challenge-level result staying
pending while a future period exists, cut_back's locked aggregate-AND-continuity evaluator
(including a case where the aggregate alone would pass but continuity fails, and vice versa), and a
malformed/inconsistent event chain failing safely rather than producing a false success. Since
period boundaries are consumed as opaque already-generated ISO instants (never recomputed here), DST
correctness is exercised only by using a period pair with a genuinely non-24-hour boundary in the
input fixtures, not by reimplementing any timezone logic.
