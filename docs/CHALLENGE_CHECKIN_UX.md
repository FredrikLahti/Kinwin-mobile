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
   (22 named review states, each a self-contained `{ challenge, periods, events, now }` input — the
   original 21 plus `cut-back-active-nothing-due`, added so Cut back's calm mid-tracking state is
   directly reviewable from the hub the same way Build's is).
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
   quiet informational text. A low-emphasis correction link appears only when there is something to
   correct: "Change this check-in" for Build/Cut back (`viewModel.correction.available`), or
   "Correct an earlier entry" for Stop (`viewModel.stopLapseCorrectionTarget !== null` — see "Stop
   correction targeting" below for why Stop gets its own field and its own wording).

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
rather than manufacturing a button. See fixtures `build-active-nothing-due`,
`cut-back-active-nothing-due`, `stop-active-intact`, `build-daily-reported-done`.

### Duplicated status copy

`currentPeriodCopy` (the factual "what happened" line) and `nextAction.detail` (the "what to do, and
by when" line) used to say the same thing on several states — e.g. the missed-deadline and
lapse-on-record states repeated the same sentence twice. `nextAction.detail` is now blank (`''`) on
any state where it would only restate `currentPeriodCopy`, and `home.tsx` only renders it when
non-empty. It is deliberately never blanked on the two states where it carries the reporting
deadline — `late_check_in` and `stop_final_attestation_due` — since hiding that would remove
information the founder explicitly asked to keep visible on actionable states. See
`view-model.test.ts`'s `nextAction.detail is blank when it would only restate currentPeriodCopy` and
`...keeps the reporting deadline visible on actionable late/final-attestation states`.

## Reporting timing model (locked)

The authoritative engine models a Build/Cut back period report as a single declared value for that
period (`docs/CHECK_IN_ENGINE.md`'s "declared values, not deltas") — a later value is an explicit
*correction*, not a routine update. So the UX never invites an evolving "so far" total mid-period;
it only asks for the period's report once tracking has actually ended:

- A simple, single binary daily Build promise (`isBinaryDailyTarget` — `period.target.type ===
  'completion_target' && target <= 1`) is the one shape that gets a due/not-yet prompt *during*
  tracking — see "Build interaction model" below.
- Everything else — a count-based weekly Build, and Cut back at any cadence
  (`isRoutineEndOfPeriodReport`) — shows a calm "nothing to report yet" state while tracking runs
  (`currentPeriodStatus.kind === 'calm'`, never `'check_in_due'`), and only becomes actionable
  (`'late_check_in'`) once `now >= period.endsAt`. Copy never says "so far" for these; it says e.g.
  "How many times did you go this week?" / "How many takeaway meals did you have this week?" once
  the report is actually due. See fixtures `build-active-nothing-due`,
  `cut-back-active-nothing-due` (calm, mid-tracking) vs. `build-weekly-report-total`,
  `cut-back-report-total` (tracking ended, report now due).
- Corrections after a period report has been submitted remain corrections — the "changes which
  answer counts" framing — regardless of cadence.

This does not change the domain engine; it is purely which moment the UI solicits the one legitimate
report for a period.

## Build interaction model

Two shapes, distinguished by `period.periodKind`/target, not by a separate flag:

- **A simple binary daily promise** (e.g. "Walk for 20 minutes", `isBinaryDailyTarget`):
  - *Before tracking ends*, the check-in screen shows **Done** / **Not yet**. **Done** submits
    `{ kind: 'build_completion', completions: 1 }` immediately — the user never enters a number.
    **Not yet** submits nothing at all (no domain event); it is a local, non-persisted
    acknowledgement, consistent with never fabricating a completion report. See fixture
    `build-daily-due` / `build-daily-reported-done`.
  - *After tracking ends but before the reporting deadline* (`currentPeriodStatus.kind ===
    'late_check_in'`), the screen instead asks explicitly: "Did you complete this for that day?"
    with **Yes** / **No** — both are real submissions (`completions: 1` / `completions: 0`), never a
    no-op, since silently reusing the due-state's "Not yet" dismissal here would misrepresent a
    finished day as still pending. See fixture `build-late-reporting-open`.
- **A count-based weekly promise** (e.g. "Go to the gym 4 times this week"): once tracking has
  ended, the check-in screen shows a stepper and asks "How many times this week?", then submits that
  single declared total (`{ kind: 'build_completion', completions: N }`) — never a per-tap
  increment/delta, and never "so far" while tracking is still running (see "Reporting timing model"
  above). See fixture `build-weekly-report-total`.

Progress never lets one over-completed period visually imply banked credit toward another — see
"Progress presentation" below for exactly what is and isn't computed for display.

## Cut back interaction model

Once tracking has ended, the check-in screen asks "How many `<unit>` this week?" using the
challenge's actual unit (`period.target.measurement.unit`, e.g. "meals") and the actual maximum
(`period.target.maximum`), never a generic count and never "so far" — see "Reporting timing model"
above for why this is only ever solicited at period end, regardless of cadence. After submission, the
screen and the home current-period line both show the declared total against the maximum, framed
neutrally ("2 of 3 meals — within the limit." / "5 of 3 meals — over the limit.") — no shame-oriented
language, see `view-model.test.ts`'s explicit assertion that over-limit copy never contains "fail".
See fixtures `cut-back-active-nothing-due` (calm, mid-tracking), `cut-back-report-total`,
`cut-back-within-limit`, `cut-back-over-limit`.

A final Cut back total of zero is a legitimate answer — the input starts on a real, submittable `0`
(or, when correcting, the currently recorded value) rather than an empty field showing a `0`
placeholder that looks selected but can't actually be submitted.

## Stop interaction model

Stop is modeled distinctly from a daily checkbox, per `resolveStopHistory`'s sticky-lapse semantics.
The normal V1 lifecycle reads: **nothing required → report a lapse if one happens → final
attestation after tracking ends.**

- **During tracking, intact** (`stop-active-intact`): no daily prompt. The home screen shows calm
  copy — "No check-in needed right now." — plus a single, low-emphasis, obvious action: **Report a
  lapse**. The check-in screen it opens leads with "Did something happen?" / "Yes, report a lapse" as
  the *primary* action; "No, still going" is a de-emphasized secondary that submits an ordinary
  `stop_intact`. The domain still accepts — and this UX still supports — that ordinary attestation;
  it simply does not require or promote it as a routine daily ritual. See fixture
  `stop-lapse-reporting`.
- **A lapse is on record** (`stop-lapse-recorded`): the home screen calmly states "A lapse is on
  record," without pretending a later "Still going" restores success — because it doesn't, per the
  engine's sticky-lapse rule. No financial consequence is triggered or simulated here.
- **Accidental lapse correction** (`stop-accidental-correction`): while the reporting window is
  open, "This was reported by accident" submits a `correction` event targeting a *specific,
  currently-effective* `stop_lapse` entry — see "Stop correction targeting" below for how that
  target is chosen, not a fresh ordinary declaration.
- **Final attestation** (`stop-final-attestation-due`): once tracking ends
  (`now >= period.endsAt`) and before the reporting deadline, a distinct screen asks "Did you keep
  this promise for the full challenge?" (with the promise itself shown as its own line, not stitched
  into the sentence — an earlier draft literally read "Did you stay stay smoke-free…"). A qualifying
  success requires a genuine, ordinary, root `stop_intact` declaration whose own timestamp falls in
  `[endsAt, reportingClosesAt)` — see `stop-corrected-attestation-required`, which exercises the
  exact regression this locks against: an earlier lapse corrected to intact *after* tracking ends
  does **not**, by itself, satisfy the final attestation (the correction's own timestamp is never
  treated as a fresh attestation); a *separate* ordinary `stop_intact` declaration is required, and
  `stop-final-attestation-complete` shows that satisfied. This is exercised end-to-end through
  `view-model.ts`, not re-implemented as a second rule.

### Stop correction targeting

`resolveStopHistory` can have several independent, simultaneously-live chains (e.g. an early
ordinary `stop_intact` ping and, separately, a later `stop_lapse`) — each is its own valid correction
target. An "accidental lapse" correction must target a chain whose *current* effective fact is
actually `stop_lapse`; blindly using `correction.targets[0]` could pick an unrelated intact chain
instead and produce a nonsensical "correction." `ActiveChallengeViewModel.stopLapseCorrectionTarget`
is computed specifically for this: it filters `resolveStopHistory`'s `validCorrectionTargets` down to
entries whose fact is `stop_lapse`, then deterministically picks the most recently recorded one. See
`view-model.test.ts`'s `the Stop lapse-correction target is deterministically an effective stop_lapse
entry, not just the first correction target` — constructed with two live chains (one intact, one
lapse) specifically to catch a `targets[0]` regression. Picking *which* lapse to correct when several
uncorrected lapses exist at once is intentionally out of scope here — the deterministic
"most-recent" choice is a documented, simple default; a richer historical-selection UI is future
work.

Wherever this action appears (home's link, the correction screen itself), the wording is "Correct an
earlier entry" — not the Build/Cut back "Change this check-in" phrasing, which does not fit an
already-decided-except-for-final-attestation Stop history.

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

A low-emphasis correction affordance appears exactly when there is something to correct — for
Build/Cut back, `viewModel.correction.available` (derived from the same `reportingClosesAt` gate the
engine itself enforces via `reduceEffectiveFact`, not a re-derived duration); for Stop,
`viewModel.stopLapseCorrectionTarget !== null` (see "Stop correction targeting" above). The
correction screen shows the currently recorded answer — prefilled into the input rather than reset
to zero/empty — and copy that the change "changes which answer counts... the original check-in
remains in history," never "delete" language. Once the reporting deadline has passed
(`build-correction-closed`), the same historical entry instead shows "The reporting window for this
check-in is closed," with no edit control. Every correction submission is routed through the real
`planCheckInAppend` (`contexts/challenge-ux-preview-context.tsx`'s `submit`), which is the sole
authority on whether a correction is accepted.

## Check-in confirmation

After a successful submission, the check-in screen shows a plain "Recorded." confirmation with what
was recorded (`describeFact`), then returns to the active-challenge home on request — no confetti,
no celebratory animation for routine data entry. The existing `AnimatedPrimaryButton`'s restrained
press feedback and `playImportantHaptic` are reused rather than adding new motion.

## Progress presentation

`ProgressSummary` splits two things that used to be collapsed into one confusing line (a threshold
restatement, e.g. "10 of 14 total completions needed to succeed", that visually read like current
progress): `progressSoFarLabel` (factual progress so far) and `requirementLabel` (the rule's own
threshold, restated — never computed here):

- **Build**: `progressSoFarLabel` is `"<N> completions count so far."`, where `<N>` mirrors
  `evaluateBuild`'s own per-period capping (`Math.min(completions, period.target.target)`, summed
  across closed periods) — for **display only**; it never decides success, and it is exercised
  against the same fixture `evaluateChallenge` itself grades (`final-success`) to keep it honest.
  `requirementLabel` is `"Need <minimumRequiredCompletions> of <totalPlannedCompletions> to pass."`
- **Cut back**: `progressSoFarLabel` is `"<met> of <closed> closed periods stayed within the
  limit."`, a direct restatement of `EffectivePeriodState.kind === 'satisfied'` counts — no new
  computation — and is `null` until at least one period has actually closed (a period that is merely
  `'open'`, even with a report already on it, has not closed yet). `requirementLabel` is `"Need
  <minimumPeriodsWithinLimit> of <totalPeriods> to pass."`
- **Stop**: `progressSoFarLabel` is always `null` — for a single continuous period, "progress so far"
  would just restate `currentPeriodCopy`. `requirementLabel` is the fixed "Zero lapses allowed for
  the full challenge."

A streak label appears only once it reaches two or more consecutive satisfied periods (and never for
Stop's single continuous period). Nothing here computes a "% chance of success" or any
predictive/motivational number — the domain engine is deliberately conservative-by-construction (no
early/mid-challenge determination), and the UI does not invent one either.

## Consequence wording

`buildConsequenceSummary` used to read "$50 goes to Mom instead of you" — which implies the stake
was otherwise the participant's to keep, and that isn't the Kinwin model: the stake was never
otherwise going to the participant. It now reads truthfully and category-aware, using the fixture's
actual recipient and `consequenceCategory` (`ExperienceCategory` — dinner/adventure/culture/getaway/
wellness): `"If you don't keep the promise, $50.00 goes toward Mom's dinner — and you sit it out."`
This is shown identically on the home screen's "If the promise isn't kept" section and on the
final-failure lifecycle card (both read `viewModel.consequenceSummary` — one source of truth, not two
independently-worded copies). It never implies a charge has already happened — no past-tense
"charged"/"paid" language, see `view-model.test.ts`'s explicit assertion.

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

**Fixture-only** (authored for this prototype, not production data): the 22 scenarios' concrete
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
`test` script) covers: every one of the 22 named states resolving to its intended, engine-derived
status; the late-check-in grace state never reading as failure; the missed-deadline state's exact
neutral copy; correction availability tracking the reporting window; Cut back copy using the
challenge's real unit and total; a simple daily Build target describing itself as a single action
(`describePeriodTarget` → `"Once today"`); a weekly Build target describing a period total, not a
daily tally; an active, intact Stop challenge never demanding a daily check-in; an uncorrected lapse
remaining failure-relevant after a later ordinary intact ping; a corrected lapse not satisfying the
final-attestation requirement on its own; a qualifying final ordinary intact attestation producing a
domain-derived satisfied state; and final challenge success/failure matching `evaluateChallenge`
exactly rather than independent UI math. Added in this revision: weekly Build/Cut back staying calm
("nothing to report yet", never "so far") while tracking runs and only becoming actionable once
tracking ends (`isRoutineEndOfPeriodReport`/`isBinaryDailyTarget`); the Stop lapse-correction target
being deterministically an effective `stop_lapse` entry even when a second, unrelated intact chain
exists (guards the `targets[0]` regression directly); `nextAction.detail` being blank exactly where
it would duplicate `currentPeriodCopy`, while staying non-empty (deadline visible) on the actionable
late/final-attestation states; the consequence summary never implying the stake was otherwise the
participant's, never implying a charge already happened, and being category-aware; and Build/Cut
back progress reporting factual progress-so-far separately from the rule's own requirement. It does
not snapshot every screen — component-level rendering is covered by manual visual review (see the PR
description for the screenshot set), not by a growing pile of brittle snapshots.
