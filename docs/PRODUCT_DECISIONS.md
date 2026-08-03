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
* If membership access expires during an active challenge, the challenge enters restricted Completion Mode. Essential check-ins, challenge status, final result, and consequence completion remain available, but new challenges and full member features require active membership.
* Personal learnings should eventually be stored in “What works for me.”

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
  Personal Playbook.
* All of the above remain local, session-only preview behavior. Nothing is persisted outside the
  running app session, and reloading the app clears preview activity by design.
* No real authentication, persistence, Stripe charging, Tremendous fulfillment, analytics, or push
  notifications are connected. All financial and authoritative challenge evaluation remains
  server-trusted and unimplemented in the client.
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
