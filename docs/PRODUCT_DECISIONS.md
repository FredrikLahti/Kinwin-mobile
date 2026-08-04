# Kinwin Product Decisions

## Core

* Product name: Kinwin
* Tagline: “When you fail, your loved ones win.”
* Kinwin is an iOS-first mobile app with Android supported from the same codebase.
* The mobile app is being built from scratch.
* The previous web application must not influence the new architecture, design, copy, or flows.
* Product and UX decisions are made before deep implementation.
* Build and review one screen or flow at a time.
* Use mock data and local state before adding real integrations.
* The goal gives the behavior meaning.
* The behavior is the user’s promise.
* Financial consequences are normally attached to controllable behaviors, not uncertain outcomes.
* If the user fails, selected loved ones receive the reward.
* The user promises not to participate in the resulting experience.
* Kinwin encourages honesty but does not pretend it can police real-world behavior.
* Recipient confirmation does not block a challenge from starting.
* Recipient confirmation does not block challenge preparation (converting a completed draft into a server-owned pending commitment).
* Recipients cannot be replaced by the user after commitment creation.
* A pending commitment is no longer editable once created.
* A user may only ever have one pending commitment at a time; preparing a second draft while
  one is already pending is rejected server-side, and the account screen steers toward
  resolving the existing one instead of starting another.
* The owner can cancel a pending commitment before activation; cancellation is explicit
  (requires confirmation), preserves every row for history rather than deleting anything, and
  frees the user to start a fresh draft.
* Repeating a request to prepare the same draft must return the same challenge, never create a duplicate.
* Repeating a request to cancel an already-canceled commitment must return the same result, never error.
* The client must never write directly to `challenges`, `challenge_recipients`, or `consequences` — only a trusted server-side function may.
* If membership access expires during an active challenge, the challenge enters restricted Completion Mode. Essential check-ins, challenge status, final result, and consequence completion remain available, but new challenges and full member features require active membership.
* Personal learnings should eventually be stored in “What works for me.”

## Timezone, start, and DST rules

* The challenge timezone is an IANA timezone (for example `Europe/Stockholm`), validated
  server-side against the server's own timezone database.
* The timezone is frozen at final activation and never changes for the rest of the
  challenge, regardless of later travel or a device's own timezone changing.
* Measurement starts at the next local midnight strictly after the activation instant —
  never the activation instant itself, even if activation happens to land exactly on a
  local midnight.
* Challenge duration is measured in whole local calendar weeks, not a fixed number of UTC
  hours.
* Daylight saving transitions preserve local midnight period boundaries: a local day (or
  the local day inside a weekly period) that contains a DST transition spans 23 or 25 UTC
  hours instead of exactly 24, but every period boundary still lands on true local
  midnight.
* Travel or a device's own timezone changing after activation must never alter already
  generated periods — the frozen challenge timezone from activation is the only one that
  is ever used.
* Period structure by direction and rhythm/boundary: Build with a daily rhythm, and Cut
  back with a day boundary, each generate one period per local calendar day. Build with a
  weekly_count or specific_days rhythm, and Cut back with a week boundary, each generate
  one rolling seven-local-day period per challenge week. Stop generates one continuous
  period covering the whole challenge.
* Implemented by `private.generate_challenge_periods`
  (`supabase/migrations/20260809000000_server_generated_periods.sql`) — the single
  authoritative server-side implementation of this date/DST logic; see
  `docs/SUPABASE_SCHEMA.md`'s "Trusted RPCs" section and
  `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 4. Not yet called from anywhere — full
  activation (phase 3b) does not exist yet, so this does not yet affect any real
  challenge.

## Brand and interaction

* Visual theme: “Two Futures.”
* Recurring visual motif: “The Kinwin Thread.”
* Brand line: “Every promise creates two futures.”
* Design principle: “Distinctive in use, discreet at a glance.”
* Kinwin uses semantic motion and haptics based on the meaning of an interaction.
* Motion should feel alive, purposeful, premium, and restrained.
* The app must respect reduced-motion accessibility settings.
* A cartoon mascot is not part of the current visual direction.
* Clarity comes before symbolism.
* The Kinwin Thread should usually be a subtle progress or connection motif rather than a dominant abstract diagram.
* The first onboarding step asks for the user’s larger desired outcome.
* The goal supplies meaning; the controllable behavior is defined in the following step.
* The brand concept experiment validated semantic haptics and restrained motion, but its UI layout was not approved as production design.

## Current scope

* The clean mobile foundation exists, and the full prototype onboarding flow (goal, behavior
  direction, definition, rhythm, timeframe, success rule) is implemented end to end.
* Consequence setup (recipients, organizer, experience, stake, review) and the share/activation
  flow (message, recipient preview, membership gate, prototype activation shortcut) are
  implemented.
* The active-challenge preview flows are implemented: Home, Progress, Check-in, Recovery, and
  Personal Playbook. These remain local, session-only preview behavior — nothing beyond them is
  persisted, and reloading the app clears preview activity by design.
* Real Supabase authentication (email/password) and editable-draft persistence are implemented and
  verified against a real local GoTrue/PostgREST stack in CI (see
  `docs/BACKEND_IMPLEMENTATION_PLAN.md` phases 1–2).
* A trusted server RPC (`prepare_challenge_from_draft`) converts a completed, saved draft into a
  server-owned, `pending_activation` challenge plus its recipients and a pre-payment consequence
  record — real persistence, but deliberately not an active challenge. It is a distinct state from
  the local "Preview active challenge" prototype shortcut, which stays session-only and unchanged
  (see `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3a).
* A pending commitment survives an app restart or new login: a dedicated screen
  (`app/account/pending-commitment.tsx`, linked from the account screen) reads it back, shows a
  read-only summary of everything already locked in, and lets the owner cancel it (via the trusted
  `cancel_pending_challenge` RPC) before starting a new draft. "Continue setup" only opens a
  truthful placeholder for the still-unbuilt payment step — it never fakes payment or activation
  (see `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 3a-ii).
* No Stripe charging, Tremendous fulfillment, analytics, or push notifications are connected yet.
  Real challenge activation (timezone, start/end timestamps, the immutable activation snapshot) and
  payment authorization/charging remain unimplemented. The trusted, deterministic period generator
  (`private.generate_challenge_periods`, see the "Timezone, start, and DST rules" section above) is
  implemented and tested but not yet called from anywhere, since it is designed to run from within
  full activation, which does not exist yet; check-in evaluation also remains unimplemented. None of
  this is wired to the client.
* A production-oriented domain model (`domain/`) and an initial Supabase migration
  (`supabase/migrations/`, documented in `docs/SUPABASE_SCHEMA.md` and
  `docs/PRODUCTION_DATA_MODEL.md`) exist as version-controlled groundwork. The migration has not
  been deployed to any environment and still requires exercising constraints, triggers, RLS, and
  grants in a disposable development Supabase project before any production use.
* The approved visual and interaction design direction (dark-first, warm near-black, warm
  off-white, restrained copper/amber, serif headings, "Two Futures"/"Kinwin Thread" motif) is
  established and applied throughout the current screens. Further product-quality refinement of
  individual screens remains possible and does not require redefining the direction itself.
* Future work should be grouped into coherent, explicitly scoped packages (e.g. one flow or one
  defect at a time) rather than reverting to the obsolete "only the first onboarding step" scope
  described in earlier revisions of this document.

## Working method

* The founder discusses product decisions with ChatGPT.
* ChatGPT produces implementation prompts for the coding agent for a given package of work.
* Claude Code, or another approved coding agent, implements one approved package at a time and
  preserves working code created by other agents.
* The coding agent explains results and any required founder actions in clear, beginner-friendly
  Swedish.
