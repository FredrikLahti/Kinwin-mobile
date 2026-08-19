# Kinwin Product Decisions

> This document records product decisions (what Kinwin should be), not implementation status. For what is actually built today, see `docs/PRODUCT_STATUS.md`. For release-gate status, see `docs/LAUNCH_READINESS.md`.

## Core

* Product name: Kinwin
* No tagline is currently adopted. The founder explicitly retired "When you fail, your loved ones win." for reading as cheesy; nothing has replaced it as declared product copy.
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

## Success Means

* Kinwin computes a baseline success requirement for every Build and Limit challenge, derived from duration and rhythm. The user may make that requirement stricter. The user may never make it more lenient than the Kinwin baseline.
* A dedicated "Success Means" step sits between Duration and Recipients, for all three challenge types (Build, Limit, Avoid), so success calculation is understood before money or recipients are chosen.
* Build and Limit show the user an integer stepper for the overall threshold, bounded to `[Kinwin's baseline, total planned sessions/periods]` — never a free percentage slider, never a preset percentage list, and never a value below the baseline.
* The continuity safeguard (e.g. "Never miss more than 2 days in a row.") is fixed and not user-adjustable — it applies in addition to the overall threshold, always, regardless of the selected threshold.
* Avoid (Stop) has no adjustable threshold at all: success always means zero lapses for the full challenge. The Success Means step still shows Avoid a fixed, unambiguous statement of that ("no allowance, for the full challenge") — it is never presented as if a lapse allowance could exist.
* For a newly configured Build or Limit challenge, the threshold defaults to Kinwin's current automatically-derived baseline. A challenge is never silently made stricter than that default; the user must explicitly increase it.
* Once a challenge is activated, its success rule is immutable — the frozen `activation_snapshot` never changes, regardless of any later product change to how new challenges are configured.
* Versioning: `successRule.ruleVersion` is `1` for a challenge whose overall threshold is exactly Kinwin's derived baseline (unchanged historical behavior — every already-created V1 draft/challenge remains valid forever, is never migrated or mutated in place, and is never reinterpreted as weaker than what it actually is). `ruleVersion` is `2` for a Build or Limit challenge whose user selected an overall threshold strictly greater than the baseline, while every other derived field (total planned, continuity safeguard, period target/unit) stays identical to what the baseline calculation would produce. Avoid never has a `ruleVersion 2` — zero lapses cannot be made "stricter" than zero lapses.
* The trusted server boundary (`prepare_challenge_from_draft`) independently re-derives Kinwin's baseline and total from the draft's own duration and rhythm/boundary before accepting a `ruleVersion 2` selection — it never trusts a client-submitted baseline or total. A malicious or buggy client cannot save a weakened `ruleVersion 2` selection (below the real baseline) or an inflated one (above the real total); both are rejected server-side regardless of what the draft payload otherwise claims.
* When an upstream input changes after a stricter threshold was selected (duration, Build frequency, selected weekdays, or Limit period), the previously selected threshold is preserved if it still fits the newly derived range; otherwise it is clamped into range — never left below the new baseline, never left above the new total, and never silently reinterpreted as a weaker challenge than the user actually chose.
* The Review screen shows the user's actual selected requirement (e.g. "Complete at least 27 of 28 planned sessions.") together with the fixed continuity rule (e.g. "Never miss more than 2 days in a row.") — never only one while silently enforcing the other. Review is read-only confirmation; there is no second Success Means editor there.
* Final challenge-result evaluation reads the same stored threshold Review displayed — a stricter `ruleVersion 2` selection is what actually decides success or failure, not a silently-reused baseline.

## Timezone, start, and DST rules

* The challenge timezone is an IANA timezone (for example `Europe/Stockholm`), validated
  server-side against the server's own timezone database.
* The timezone is frozen at final activation and never changes for the rest of the
  challenge, regardless of later travel or a device's own timezone changing.
* The challenge becomes active at the moment it is activated. Measurement starts at the
  activation instant's own local calendar date, at that date's local midnight — never
  deferred to the next day. This makes today's period exist immediately, so a specific-day
  schedule (for example Monday/Wednesday/Friday) that includes today already counts today
  toward the challenge; a schedule where today is not a selected day is still active
  immediately, with its first required scheduled completion naturally falling on the next
  selected day.
* Challenge duration is measured in whole local calendar weeks, not a fixed number of UTC
  hours.
* Daylight saving transitions preserve local midnight period boundaries: a local day (or
  the local day inside a weekly period) that contains a DST transition spans 23 or 25 UTC
  hours instead of exactly 24, but every period boundary still lands on true local
  midnight — with one narrow, explicit exception: a small number of IANA zones (for
  example `America/Santiago`) run their spring-forward transition at exactly local
  midnight, so that one instant does not exist that day. On that specific day, the
  boundary is the first valid local instant after the gap (e.g. 01:00 instead of 00:00)
  rather than an earlier approximation — the same deterministic, tzdata-consistent
  conversion applies uniformly to every boundary, so this never produces a gap or overlap
  between periods, only a one-hour-later boundary on that one day in that one zone.
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

## Consequence payment setup (Stripe test mode)

* Saving a payment method (a Stripe SetupIntent) is a distinct step from charging it —
  this package only ever saves a method for later, possibly-offline use. It never
  charges anything, and it never changes `challenge_status` to `active`; the pending
  commitment stays `pending_activation` throughout.
* Provider (Stripe) signature/webhook verification is the authoritative source of truth
  for whether a payment method was actually saved — never the client's own claim, and
  never the initial API response alone. `consequences.authorization_status` only
  becomes `authorized` after a verified `setup_intent.succeeded` webhook event.
* Membership entitlement (`memberships`) and consequence payment authorization are and
  remain separate concerns. Final challenge activation (still future work, phase 3b)
  will require both a valid membership and a verified consequence authorization — this
  package resolves only the second, and only its pre-activation setup half.
* Currency support is unchanged by this package: `consequences.currency` remains
  constrained to `USD` (`070_constraints.sql`), and nothing here introduces multi-currency
  handling.
* Cards only in this first package; a future package may add other payment method types.
* **Consent contract**, implemented by `app/account/payment-setup.tsx`'s consent screen:
  before opening Stripe's PaymentSheet, the client shows the owner, in plain language:
  - no charge is made now;
  - the exact stake amount and currency this method is being authorized for;
  - the condition that may trigger a later charge (failing the challenge, per the
    accepted success rule);
  - that the resulting charge may happen while the owner is offline (Stripe's
    `off_session` usage — this is not a live, in-person confirmation);
  - that the method is saved specifically for this stated purpose, not stored for
    general/future unrelated use;
  - that completing payment setup alone does not activate the challenge — activation is
    a separate, later step.
  This is a list of the data the copy must convey, not approved legal wording — final
  consent copy requires legal review before shipping, and nothing in this package
  should be read as having already received it.

### Consequence-consent / Terms gap analysis (evidence-based, added by the launch-compliance package)

**What the current UI already discloses**, confirmed directly in the code:
- `app/create/review.tsx`: a required checkbox — *"If the challenge fails, the reward is for my recipients. I will not take part in their experience."*
- `app/account/payment-setup.tsx`: a required checkbox plus a four-point disclosure list — no charge now; card saved securely with Stripe; a charge can happen automatically, even while offline; the card is used only for this commitment.
- `app/create/review.tsx`: *"Kinwin membership is free during the beta. No card is charged for membership."*

**A real gap this package found**: none of the above, nor any other user-facing screen prior to `app/legal/privacy.tsx` (new in this package), tells the tester that the stake amount itself is a TEST-mode value with no real money at risk. The existing copy says a charge "can happen automatically" without saying that charge is fake in the current build. This matters because a beta tester reading only the in-app copy has no way to know the dollar figure they're agreeing to isn't real — worth closing before external beta scales past people the founder can personally brief.

**What remains legally/product-review dependent** (unchanged from the existing note above, restated for completeness): the exact wording of every consent point listed is founder/product-drafted, not legally reviewed. None of it should be treated as sufficient for a real-money public launch as-is.

**Language that needs external legal review before real-money public launch:**
- The sit-out acknowledgment and payment-disclosure copy above, verbatim.
- A real Terms of Service, if legal/business review decides Kinwin needs one — Apple's own standard EULA otherwise applies to the App Store submission by default, so this is not a generic Apple requirement. No route currently exists for this (the earlier unlinked placeholder route was removed as unnecessary; see `docs/PRODUCT_STATUS.md`).
- A refund/dispute policy — none exists in any form today; not addressed by this package.
- Explicit "this is a TEST/beta build, no real money" disclosure at the point the stake amount is set and at payment authorization, not just in the Privacy page.

TEST beta and a real-money production launch must remain clearly distinguishable to users, not just enforced in build config — see the gap above.
* Implemented by `supabase/functions/create-consequence-setup-intent` and
  `supabase/functions/stripe-consequence-webhook`, and by the client consent + native
  PaymentSheet flow at `app/account/payment-setup.tsx`; see `docs/SUPABASE_SCHEMA.md`'s
  "Trusted RPCs" section, `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 8, and
  `docs/PAYMENT_SETUP.md` for the full flow and local testing instructions. Memberships,
  charging, final activation, check-ins, and Tremendous fulfillment remain deliberately
  out of scope for this package.

## Server-scheduled challenge completion

* Challenge outcome must not depend on the owner opening Kinwin. Supabase Cron invokes a dedicated service-only worker every 15 minutes; it uses persisted server-generated reporting deadlines, reconciles `active`/`completion_mode` to `awaiting_resolution`, and runs the same deterministic evaluator and atomic terminal write as the authenticated fast-path.
* Challenge outcome (`completed_success` or `completed_failure`) is separate from consequence fulfillment. Scheduled completion never charges Stripe, creates a charge attempt, or starts Tremendous fulfillment.
* The authenticated app trigger remains as defense in depth and for faster convergence, but server scheduling is authoritative for eventual completion. See `docs/SCHEDULED_CHALLENGE_COMPLETION.md` and migration `20260821000000_server_scheduled_challenge_completion.sql`.

## Server-side Stripe failure charging

* Only a persisted `completed_failure` creates one durable payment obligation. The
  separately scheduled payment worker derives the owner, locked stake amount/currency,
  Stripe Customer, and saved PaymentMethod from trusted server rows; no client supplies
  financial inputs.
* One PaymentIntent is retained for the obligation. A verified Stripe webhook is the
  only authority that marks it paid; challenge truth remains `completed_failure` through
  declines, authentication, card replacement, retries, and eventual payment.
* Successful payment stops at `reward_fulfillment_pending`. Tremendous and reward truth
  remain a separate future package. See `docs/STRIPE_FAILURE_CHARGING.md`.

## Recipient invitation access

* Each locked challenge recipient has a separate, private invitation lifecycle. The
  owner shares the link themselves and Kinwin sends no unsolicited email or SMS.
* A 256-bit bearer token provides beta recipient access without collecting email or
  phone number. Only its SHA-256 hash is stored. Sharing again rotates the link.
* The recipient projection contains only the inviter name, their own name, challenge
  goal and behavior, consequence category, sit-out promise, and invitation status.
* Accepting or declining never gates activation, changes challenge or payment truth, or
  creates a Kin relationship. The same accepted link remains usable for future scoped
  reward delivery. See `docs/RECIPIENT_INVITATION_ACCESS.md`.

## Reward organizer and fulfillment

* Every prepared challenge has exactly one immutable canonical reward organizer. A
  recipient organizer links to the existing beneficiary and reuses that invitation. An
  external organizer remains a distinct non-beneficiary with organizer-scoped access.
* Kinwin v1 creates one full-value reward obligation for one successfully charged failed
  challenge. The stake is never split per recipient. The canonical organizer is the
  single handoff target and coordinates one shared reward or experience for the locked
  recipient group. The challenge owner always sits out.
* The accepted organizer invitation is the durable v1 reward recovery channel. Losing a
  Tremendous LINK does not require contact PII: the organizer returns to Kinwin and explicitly
  opens a freshly generated transient link. If the Kinwin URL is lost, Share again rotates the
  bearer token while preserving the accepted invitation, canonical organizer, fulfillment, and
  provider identities. The old token stops working.
* For owners, a failed challenge has four reward states: waiting for the organizer,
  preparing the reward, ready for organizer handoff, and needs attention. For organizers,
  reward access remains an explicit `Open reward` action. "Ready" means the external LINK is
  ready for handoff; Kinwin does not claim that anyone redeemed it, used it, or attended the
  experience.

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
* Interaction rule: a user should be able to predict what will happen from where they touch. If an entire row is tappable, the row must visually communicate that it is a control (a border, background, or pill). If only text looks interactive, only the text plus a reasonable touch margin should trigger it — no large invisible hitboxes.
* Home already implements the hierarchy this bullet used to describe as future work: (1) the user's own current commitment — identity, current requirement/status, primary action, real progress, time remaining, then stake/recipients as a restrained secondary reminder — before (2) a small, capped "From your Kin" section, which is entirely absent when there is nothing relevant to show. Everything else (reactions, discovery, a feed) still lives elsewhere (Kin tab, Me) and remains out of scope for Home.

## Commitment journey and account gate

Locked from the commitment-home-ux package (launch/landing, account gate, Review/auth integration, and Home hierarchy):

* A first-time user may complete the entire challenge definition — goal, type, rule/frequency, duration, Success Means, recipients, consequence/stake, and Review — while signed out. Review stays fully readable without an account; nothing earlier in the flow interrupts to demand sign-in.
* Account creation is the last gate before commitment, not a separate detour: it is presented as a contextual modal from within Review itself (not a full-screen route), so the draft the user just built never has to survive being navigated away from and back.
* Authentication succeeding is never, by itself, sufficient to save, prepare, or activate a challenge. Signing in or up only unlocks the same explicit "Confirm commitment" action to be tapped again; the actual server-side commitment (`prepare_challenge_from_draft`) only ever runs from that explicit tap, never from an auth-status effect. (This closed a real pre-existing gap: the old `resumeSave=1` mechanism auto-saved the moment a sign-in redirect returned, with no further explicit action — removed as part of this package.)
* Home's hierarchy centers the user's one current commitment — see the updated "Future Home direction" bullet above, now implemented rather than planned.
* Kin activity on Home stays a small, secondary, capped module, absent entirely when empty — never redesigned into a feed as part of this or any UX-polish package.

## Kin social interaction

Locked from the Activity/reactions V1 package (emoji reactions + lightweight comments), replacing the earlier five-word reaction vocabulary (Respect/Nice/Worth it/Ouch/Brutal):

* Kin social interaction (reactions, comments) is Kin-only by default — no public visibility, no strangers, ever. This is not a per-post choice; it is the one and only audience model.
* Emoji reactions are a lightweight, one-tap acknowledgment — standard Unicode emoji, not a Kinwin-branded emotional vocabulary the app prescribes to friends.
* Friendship-specific tone (the actual "You've got the next one" vs "Book the restaurant, you idiot" range) lives primarily in user-authored comments, not in reactions. Reactions cannot and should not try to carry that range.
* Activity comments are intentionally short (200 characters) and flat — no threading, no nested replies, no comment reactions, no edit history. The smallest system that still lets a real sentence exist.
* Near-failure Activity events and any notification system are explicitly deferred, not part of this package.

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
  `cancel_pending_challenge` RPC) before starting a new draft. "Continue setup" opens
  `app/account/payment-setup.tsx` — a real, native-device Stripe test-mode payment-method setup
  flow (consent → PaymentSheet → server-verified authorization) — which never fakes payment or
  activation and never treats a PaymentSheet result alone as authorization (see
  `docs/BACKEND_IMPLEMENTATION_PLAN.md` phases 3a-ii and 8, `docs/PAYMENT_SETUP.md`).
* No Stripe charging, Tremendous fulfillment, analytics, or push notifications are connected yet.
  Real challenge activation (timezone, start/end timestamps, the immutable activation snapshot)
  remains unimplemented. The trusted, deterministic period generator
  (`private.generate_challenge_periods`, see the "Timezone, start, and DST rules" section above) is
  implemented and tested but not yet called from anywhere, since it is designed to run from within
  full activation, which does not exist yet; check-in evaluation also remains unimplemented. A
  trusted, test-mode Stripe payment-method-setup flow (saving a card for later off-session use,
  never charging it) is implemented end to end — see the "Consequence payment setup (Stripe test
  mode)" section above and `docs/PAYMENT_SETUP.md` — including the client consent screen and native
  PaymentSheet at `app/account/payment-setup.tsx`. It remains its own scoped step: it never
  activates a challenge or grants membership, both of which stay separate, still-future work.
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
