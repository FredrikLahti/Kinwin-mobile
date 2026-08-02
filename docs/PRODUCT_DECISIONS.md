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

* Create the clean mobile foundation.
* Build and test only the first onboarding goal step.
* Do not implement later onboarding steps yet.
* Do not implement Supabase, Stripe, or Tremendous yet.
* Do not define the final visual identity yet.

## Working method

* The founder discusses product decisions with ChatGPT.
* ChatGPT produces implementation prompts for Codex.
* Codex implements one approved step at a time.
* Codex explains results and required founder actions in simple Swedish.
