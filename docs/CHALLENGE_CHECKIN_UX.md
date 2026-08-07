# Challenge check-in UX prototype

This document describes the isolated prototype at `app/challenge-ux-preview/` — an answer to
"what does using Kinwin feel like every day once a commitment is active?" It is UX/product work
built directly on the merged Check-in Engine (`docs/CHECK_IN_ENGINE.md`,
`domain/challenge/check-in/`, `domain/challenge/results.ts`). It is **not** the production
Supabase persistence package, does not choose a reporting-window duration, and does not add a
second rules engine.

**Entry point.** A small, clearly internal link on the welcome screen (`app/index.tsx`, "Challenge
check-in UX preview (internal prototype)") opens `/challenge-ux-preview`. It is not wired into
production onboarding or the existing `app/challenge/` preview area, and it does not touch
production persistence.

## Architecture

Four layers, kept deliberately separate:

1. **Domain state** — the real check-in engine, untouched: `ActivatedChallengeSnapshot`,
   `ChallengePeriod`, `CheckInEvent`, `derivePeriodState`, `resolveStopHistory`,
   `reduceEffectiveFact`, `evaluateChallenge`.
2. **Fixture data** — `fixtures/challenge-ux-preview/builders.ts` (typed builders mirroring the
   pattern already used in `domain/challenge/results.test.ts` and
   `domain/challenge/check-in/period-state.test.ts`) and `fixtures/challenge-ux-preview/scenarios.ts`
   (the 21 named review states, each a self-contained `{ challenge, periods, events, now }` input).
3. **Presentation adapter** — `lib/challenge-ux-preview/view-model.ts`, a pure, React-free module
   that calls `derivePeriodState` / `evaluateChallenge` / `resolveStopHistory` /
   `reduceEffectiveFact` directly and turns their output into a UI view model
   (`ActiveChallengeViewModel`, `CurrentPeriodStatus`, `CorrectionAvailability`, `NextAction`,
   `ProgressSummary`). This file formats and selects; it never recomputes satisfied / not_satisfied
   / success / failure itself — that discipline is enforced by
   `lib/challenge-ux-preview/view-model.test.ts` (see "Tests" below).
4. **React components** — `app/challenge-ux-preview/{index,home,check-in,result}.tsx`, driven by
   `contexts/challenge-ux-preview-context.tsx`. The context holds session-only state (which
   scenario is selected, and a mutable event log seeded from that scenario's fixture events); every
   mutation goes through the real `planCheckInAppend` before an event is appended — the same
   idempotency + reporting-window contract a trusted write endpoint would use. Reloading, or
   switching scenarios, honestly resets to the fixture. There is no fake repository resembling
   production persistence.

## Active challenge hierarchy

`app/challenge-ux-preview/home.tsx` is the primary surface, and answers three questions with
strong visual hierarchy, top to bottom:

1. **What did I promise?** — the goal (`viewModel.goal`) and the promise itself
   (`viewModel.promise`), in that order, largest type on the screen.
2. **What matters right now?** — the current-period section, headlined by "Today" / "This week" /
   "Your promise" (Stop), with a status line and a short supporting sentence
   (`viewModel.currentPeriodCopy`).
3. **Do I need to do anything right now?** — either a primary action button (only when
   `viewModel.nextAction.kind` is one of `check_in` / `late_check_in` / `stop_final_attestation`) or
   quiet informational text. A low-emphasis "Change this check-in" link appears only when
   `viewModel.correction.available` is true.

Below that: progress, time remaining, and the consequence summary — present, but visually
subordinate, consistent with "do not turn the app into a spreadsheet or audit log." No event IDs,
rule-engine versions, database concepts, raw ISO timestamps, or technical status strings
(`closed_without_input`, `not_satisfied`, …) ever reach this screen; every one of those is mapped to
plain language by `view-model.ts`.

### "Nothing required right now" is a first-class state

When `currentPeriodStatus.kind` is `'calm'` (an open period with no fact yet, but not on a daily
cadence — e.g. a weekly Build count mid-week, a Stop challenge that is intact, or a Cut back period
not yet reported) or `'reported'`/`'late_reported'` (already checked in, correction still available),
`nextAction.kind` is `'none'` and the screen shows a calm, factual sentence ("You're up to date")
rather than manufacturing a button. See fixtures `build-active-nothing-due`, `stop-active-intact`,
`build-daily-reported-done`.

## Build interaction model

Two shapes, distinguished by `period.periodKind`, not by a separate flag:

- **`periodKind === 'day'`** (a simple daily/binary promise, e.g. "Walk for 20 minutes"): the
  check-in screen shows **Done** / **Not today**. **Done** submits `{ kind: 'build_completion',
  completions: 1 }` — the user never enters a number. **Not today** submits nothing at all (no
  domain event); it is a local, non-persisted acknowledgement, consistent with never fabricating a
  completion report. See `describePeriodTarget` returning `"Once today"` for this shape, and fixture
  `build-daily-due` / `build-daily-reported-done`.
- **`periodKind === 'week'`** (a count-based promise, e.g. "Go to the gym 4 times this week"): the
  check-in screen shows a stepper and asks for the **total** completed so far this period, then
  submits that single declared total (`{ kind: 'build_completion', completions: N }`) — never a
  per-tap increment/delta. This matches the engine's declared-value model
  (`docs/CHECK_IN_ENGINE.md`'s "declared values, not deltas"). See fixture
  `build-weekly-report-total`.

Progress never lets one over-completed period visually imply banked credit toward another — the
progress section only ever restates the success rule's own `minimumRequiredCompletions` /
`totalPlannedCompletions` numbers (already-known domain values) alongside a plain "periods met /
periods closed" count; it does not recompute the engine's own capped-sum aggregation.

## Cut back interaction model

The check-in screen asks "How many `<unit>` so far?" using the challenge's actual unit
(`period.target.measurement.unit`, e.g. "meals") and the actual maximum
(`period.target.maximum`), never a generic count. After submission, the screen and the home
current-period line both show the declared total against the maximum, framed neutrally ("2 of 3
meals — within the limit." / "5 of 3 meals — over the limit.") — no shame-oriented language, see
`view-model.test.ts`'s explicit assertion that over-limit copy never contains "fail". See fixtures
`cut-back-report-total`, `cut-back-within-limit`, `cut-back-over-limit`.

## Stop interaction model

Stop is modeled distinctly from a daily checkbox, per `resolveStopHistory`'s sticky-lapse semantics:

- **During tracking, intact** (`stop-active-intact`): no daily prompt. An optional "Still going" /
  "I slipped" screen is reachable, but the home screen never demands it.
- **A lapse is on record** (`stop-lapse-recorded`): the home screen calmly states "A lapse is on
  record," without pretending a later "Still going" restores success — because it doesn't, per the
  engine's sticky-lapse rule. No financial consequence is triggered or simulated here.
- **Accidental lapse correction** (`stop-accidental-correction`): while the reporting window is
  open, "This was reported by accident" submits a `correction` event targeting the specific lapse
  (`resolveStopHistory`'s `validCorrectionTargets`), not a fresh ordinary declaration.
- **Final attestation** (`stop-final-attestation-due`): once tracking ends
  (`now >= period.endsAt`) and before the reporting deadline, a distinct screen asks "Did you stay
  `<promise>` for the full challenge?" A qualifying success requires a genuine, ordinary, root
  `stop_intact` declaration whose own timestamp falls in `[endsAt, reportingClosesAt)` — see
  `stop-corrected-attestation-required`, which exercises the exact regression this locks against:
  an earlier lapse corrected to intact *after* tracking ends does **not**, by itself, satisfy the
  final attestation (the correction's own timestamp is never treated as a fresh attestation); a
  *separate* ordinary `stop_intact` declaration is required, and `stop-final-attestation-complete`
  shows that satisfied. This is exercised end-to-end through `view-model.ts`, not re-implemented as
  a second rule.

## Reporting-window UX

The UI distinguishes "the behavior/tracking period ended" from "reporting is still allowed," per
`ChallengePeriod.endsAt` vs `reportingClosesAt`:

- **Grace state** (`build-late-reporting-open`): tracking ended, reporting still open, no input yet
  → `currentPeriodStatus.kind === 'late_check_in'`, and the home screen offers an explicit "Check in
  now" action with copy like "Yesterday is complete. You can still check in until 10:00 AM." The
  result stays pending; missing input is never treated as failure at this point (see
  `view-model.test.ts`'s explicit check that this copy never contains "fail").
- **Missed deadline** (`build-missed-deadline`): the reporting deadline has passed with no input →
  `currentPeriodStatus.kind === 'missed'`, with the neutral, locked wording: "No check-in was
  received before the deadline, so this period counts as not met." This is never phrased as "you did
  nothing" — that would fabricate a claim the engine never makes (see
  `docs/CHECK_IN_ENGINE.md`'s no-response policy).

The deadline clock is shown only when it is actually relevant (the grace and final-attestation
states); it is not surfaced while a user is far from needing it — see `build-daily-due`'s copy,
which never mentions a time.

## Correction UX

A low-emphasis "Change this check-in" affordance appears exactly when
`viewModel.correction.available` is true — which is derived from the same `reportingClosesAt` gate
the engine itself enforces (via `reduceEffectiveFact`/`resolveStopHistory`, not a re-derived
duration). The correction screen shows the currently recorded answer, an editable input, and copy
that the change "changes which answer counts... the original check-in remains in history" — never
"delete" language. Once the reporting deadline has passed (`build-correction-closed`), the same
historical entry instead shows "The reporting window for this check-in is closed," with no edit
control. Every correction submission is routed through the real `planCheckInAppend`
(`contexts/challenge-ux-preview-context.tsx`'s `submit`), which is the sole authority on whether a
correction is accepted.

## Check-in confirmation

After a successful submission, the check-in screen shows a plain "Recorded." confirmation with what
was recorded (`describeFact`), then returns to the active-challenge home on request — no confetti,
no celebratory animation for routine data entry. The existing `AnimatedPrimaryButton`'s restrained
press feedback and `playImportantHaptic` are reused rather than adding new motion.

## Progress presentation

`ProgressSummary` intentionally surfaces only facts already produced by the engine or already
present in `SuccessRuleSnapshot` — a "periods met / periods closed" count (from `EffectivePeriodState`
per period), a streak label only once it reaches two or more consecutive satisfied periods (and
never for Stop's single continuous period), and an aggregate label that restates the rule's own
threshold numbers. It never computes a "% chance of success" or any predictive/motivational
number — the domain engine is deliberately conservative-by-construction (no early/mid-challenge
determination), and the UI does not invent one either.

## Final result UX

`app/challenge-ux-preview/result.tsx` reads `viewModel.finalResult`, which is `null` unless
`evaluateChallenge` itself returned `evaluable: true` — the screen has no independent success/failure
math (`view-model.test.ts` asserts the view model's `finalResult.status` matches a direct
`evaluateChallenge` call exactly, for both the success and failure fixtures). Success communicates
the promise was kept and that no consequence is owed. Failure communicates the commitment didn't
meet its locked success rule and shows a neutral placeholder — "Consequence processing comes next" —
never a faked Stripe charge, gift-card delivery, or recipient confirmation.

## Domain-derived vs. fixture-only

**Domain-derived** (never hardcoded in this package): every `satisfied` / `not_satisfied` /
`closed_without_input` / `open` / `upcoming` period state, every Stop sticky-lapse/final-attestation
determination, every challenge-level `success`/`failure`, and every correction/idempotency
accept-or-reject decision.

**Fixture-only** (authored for this prototype, not production data): the 21 scenarios' concrete
`startsAt` / `endsAt` / `reportingClosesAt` timestamps, goal/behavior copy, stake amounts, and the
gap chosen between `endsAt` and `reportingClosesAt` in each fixture (10 hours for daily periods, 36
hours for weekly/continuous periods in these fixtures specifically) — see "Unresolved decisions"
below; this package does not choose that duration for production.

## Future backend dependencies

This prototype assumes, but does not build: the trusted Supabase write endpoint that calls
`planCheckInAppend` for real, a migration persisting `reporting_closes_at` on `challenge_periods`,
wiring `evaluateChallenge`'s output back into any `challenges`/`challenge_periods` status column, and
any push/notification layer. See `docs/CHECK_IN_ENGINE.md`'s "What remains for the trusted Supabase
write package" — none of that gap is narrowed here.

## Explicitly unresolved (not resolved here, on purpose)

- **The actual reporting-window duration.** Each fixture picks a concrete gap so the UI has
  something to render, but the product's real duration is not decided by this package — see
  `docs/CHECK_IN_ENGINE.md`'s "This package does not choose a duration" note, which still holds.
- **Notification/reminder cadence.** No push notifications or reminders are implemented or implied
  by any copy here.
- **Support/admin correction policy after the self-service deadline.** The "reporting window
  closed" copy states the fact; it does not describe or imply any escalation path.
- **The exact consequence-processing UI** once Stripe charging and Tremendous fulfillment exist.
  "Consequence processing comes next" is a deliberate placeholder, not a design for that screen.

## Tests

`lib/challenge-ux-preview/view-model.test.ts` (registered in `tsconfig.test.json` / `package.json`'s
`test` script) covers: every one of the 21 named states resolving to its intended, engine-derived
status; the late-check-in grace state never reading as failure; the missed-deadline state's exact
neutral copy; correction availability tracking the reporting window; Cut back copy using the
challenge's real unit and total; a simple daily Build target describing itself as a single action
(`describePeriodTarget` → `"Once today"`); a weekly Build target describing a period total, not a
daily tally; an active, intact Stop challenge never demanding a daily check-in; an uncorrected lapse
remaining failure-relevant after a later ordinary intact ping; a corrected lapse not satisfying the
final-attestation requirement on its own; a qualifying final ordinary intact attestation producing a
domain-derived satisfied state; and final challenge success/failure matching `evaluateChallenge`
exactly rather than independent UI math. It does not snapshot every screen — component-level
rendering is covered by manual visual review (see the PR description for the screenshot set), not
by a growing pile of brittle snapshots.
