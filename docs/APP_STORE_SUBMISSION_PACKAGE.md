# Kinwin App Store Submission Package

Prepared as a **draft working package**, not a final, approved submission. Everything marketing/copy-shaped below (name, subtitle, descriptions) is a candidate for founder review and edit, not a locked decision — engineering should not be treated as the source of truth for final App Store marketing copy. Everything status-shaped below (what's blocked, by what) is evidence-based, cross-checked against `docs/LAUNCH_READINESS.md` and current code as of this document's writing.

Purpose: let the founder move quickly on the App Store Connect / TestFlight submission steps once Apple access unblocks, without re-deriving this from scratch. See `docs/LAUNCH_READINESS.md` for the authoritative, continuously-maintained blocker list — this document is a narrower, submission-shaped view of a subset of that.

## App identity

| Field | Value | Status |
|---|---|---|
| Working app name | Kinwin | Used consistently in `app.config.js` (`name: 'Kinwin'`), the codebase, and all in-app copy. Treated here as the intended App Store name, but this is a founder confirmation, not an engineering decision — flag if a different listing name is wanted. |
| Bundle identifier (current) | `com.kinwin.mobile.beta` | **Explicitly not final** — `docs/IOS_BETA_BUILD.md` and `docs/LAUNCH_READINESS.md` both flag this. A production identifier decision is needed before any production signing/listing (`docs/LAUNCH_READINESS.md`'s "Product decisions before public launch" #7). |
| Version / build number | `1.0.0` / build `1`, auto-incrementing (`eas.json`'s `beta` profile: `"autoIncrement": true`) | No action needed for beta; App Store Connect will want its own version string at submission time, which can reuse this. |
| Platform | iOS only, real support | Android is a cross-platform-capable codebase but has no dedicated release contract, build profile, or App Links configuration (`docs/PRODUCT_STATUS.md` §13) — out of scope for this package. |

## Draft subtitle candidate

*"Commit to yourself. Or pay up — to the people who matter."*

(Draft only — needs founder sign-off. Kept short and true to the mechanic rather than generic self-improvement language, matching the product's stated non-motivational-poster tone.)

## Draft short description (App Store "promotional text" length)

*Kinwin turns a promise into a real commitment. Set a goal, put a stake behind it, and name who gets the reward if you don't follow through — someone you actually care about impressing. Check in for real, see your progress honestly, and let your Kin see how it's going, wins and misses both.*

## Draft longer App Store description

> Kinwin is a commitment app with real stakes.
>
> Pick a goal — something to build, something to cut back, or something to stop. Set the terms yourself: how long, how it's measured, what's on the line if you don't follow through. Then name who gets the reward if you fail — a friend, a partner, family. If you fail, they get something real. You don't get to join in.
>
> Every check-in is real and tracked server-side — no gaming your own record. Progress is shown honestly: a clean streak looks like one, and a missed day looks like one too. Failure isn't hidden or dressed up — it's just what happened.
>
> Add your Kin — real people you choose — and see what they're working on, cheer them on, or give them a hard time about it, the way you actually would. Reactions run from genuine respect to a well-earned "ouch."
>
> Kinwin is currently in beta. Payments during beta are processed in Stripe's test mode — no real money is charged to any card during this period.

(Draft only — needs founder sign-off, especially the exact framing of the consequence mechanic once real money is live. Do not submit externally-facing store copy claiming production payment behavior while the app remains in TEST-mode beta — see the TEST-mode disclosure note below.)

## Draft TestFlight beta description (internal testers)

> Thanks for trying Kinwin. This build uses Stripe **test-mode** payments — no real card is charged, ever, during this beta. You'll be asked to save a test payment method as part of setting up a challenge; that's expected and normal.
>
> What to try: create a challenge, check in on it (honestly and dishonestly — try to break it), and add a Kin connection to see the social side. If a challenge fails, the "reward" pipeline runs against Tremendous's sandbox too — no real gift card or reward is issued.
>
> Please report anything confusing, anything that looks broken, or anything where the app claims something happened before you're sure it actually did (that class of bug is the one we care about most in a money-adjacent app).

## Draft App Review notes

> Kinwin is a commitment/accountability app. A user sets a personal goal with a measurable rule, and pledges a payment (currently Stripe **test mode** only — no real money) that is given as a reward to a person they name if they fail. The person receiving the reward is *not* the user attempting the challenge — the user explicitly commits not to take part in that reward themselves. This is not a lottery, wager, or prize draw: the payment amount and the recipient are both fixed and chosen by the user in advance, and the outcome is determined by the user's own self-reported check-ins, recorded through Kinwin's trusted server-side check-in path and evaluated against the challenge's rules — not by chance or a competitive outcome against other users. Kinwin does not independently verify that the reported real-world behavior actually occurred.
>
> Reward fulfillment (currently Tremendous's sandbox/TestFlight environment, not production) issues a gift-card-style reward to the named recipient, not the app user.
>
> Social features are friends-only ("Kin"): a user must explicitly request and be accepted before any activity becomes visible to another person. There is no public feed, no public profile, and no discovery of a user's activity by strangers. Content filtering, reporting, and blocking are all implemented — see the in-app Kin tab's report/block actions.
>
> Account deletion is available in-app: **Account → Delete account**. It is blocked only while a challenge/payment/reward obligation is still in progress (to prevent deletion as an escape hatch mid-commitment); once nothing is outstanding, deletion is immediate and irreversible and removes the account's challenge history, check-ins, Playbook entries, social activity, and Kin connections.
>
> **Reviewer test account:** see the open question below — this needs a founder decision on how App Review should sign in (see "Reviewer test credentials," below).

## Support & policy URLs

| Field | Value | Notes |
|---|---|---|
| Support email | `support@kinwin.app` | Real, already wired end-to-end: `app/account/index.tsx`'s "Contact Kinwin" row, `EXPO_PUBLIC_SUPPORT_EMAIL`, and `scripts/beta-public-config.cjs`'s build-time guard (fails a beta build closed if this isn't set to a real-looking address). Resolves Apple Guideline 1.2's published-contact-info requirement. |
| Support URL (web page) | `https://kinwin-beta.expo.app/support` | **REQUIRED, not optional** — App Store Connect requires a Support URL per app version, leading to an actual support web page with a real contact channel, not just an email address on its own. Built at `app/support.tsx` (public, signed-out reachable — registered outside `app/_layout.tsx`'s `Stack.Protected` block, the same pattern as the privacy policy route). Shows `support@kinwin.app` via the same `readSupportConfig()`/`mailto:` action already used in `app/account/index.tsx`, links to the privacy policy, and mentions Account → Delete account. This exact URL only resolves once this change is merged and a fresh release has been deployed to the stable beta origin — confirm it after that deploy, the same as any route addition. |
| Privacy policy URL | `https://kinwin-beta.expo.app/legal/privacy` | Real, publicly reachable without sign-in (`app/legal/privacy.tsx`, built from `docs/PRIVACY_DATA_INVENTORY.md`'s evidence-based data inventory). **Still self-labels as a factual DRAFT**, not a finished publication-ready policy — this is Apple Guideline 5.1.1's remaining external-beta/public-launch gap per `docs/LAUNCH_READINESS.md`, not a missing feature. This exact URL only works once a release has been deployed to the stable beta origin; confirm it resolves after any future redeploy. |
| Terms of Service URL | None. | No custom Kinwin Terms exist; Apple's standard EULA applies automatically to App Store Connect submissions when none is supplied, so this is not automatically required — see `docs/LAUNCH_READINESS.md`'s Terms of Service row for the full framing. Whether Kinwin's consequence/payment model needs its own Terms is a **legal/business decision**, not made here. |

## Consequence-payment explanation (for App Review and for users)

Kinwin's core mechanic, stated precisely for submission purposes:

1. A user sets a personal goal with a measurable success rule, tracked through self-reported behavior recorded via Kinwin's trusted server-side check-in path and evaluated against the challenge's configured rules. Kinwin does not independently verify that the reported real-world behavior actually occurred — there is no biometric, device, or external verification of any kind.
2. The user pledges a monetary stake and authorizes a payment method for it (currently Stripe **TEST mode only** — `pk_test_`/`sk_test_`, enforced by a build-time guard that rejects anything else).
3. The user names one or more real recipients (people they choose) and picks one as the "canonical organizer" who will ultimately claim the reward.
4. If the challenge succeeds, nothing is charged.
5. If the challenge fails, the pledged card is charged (currently Stripe TEST mode, so no real money moves during the beta), and a reward — currently fulfilled via Tremendous's sandbox/TestFlight environment, never production — becomes available for the named organizer to claim on the recipients' behalf.
6. **The user who set the challenge explicitly commits, at creation time, not to participate in that reward themselves** — a required consent checkbox on the final review screen states this plainly: *"If the challenge fails, the reward is for my recipients. I will not take part in their experience."*

This is not gambling, a game of chance, or a prize competition: the stake amount and recipient are fixed in advance by the user, and the outcome is determined by the user's self-reported check-ins as recorded and evaluated against the challenge's configured rules, not by chance or competition against other users.

**Nothing above is legally reviewed language.** It is engineering's factual description of what the code actually does, written for App Review clarity — not a substitute for real legal review of consequence/payment/reward wording before any public, real-money launch (tracked as its own open item in `docs/LAUNCH_READINESS.md`'s "Product decisions before public launch").

## Social / friends-only privacy summary

- Kinwin's social layer ("Kin") is opt-in and mutual: a connection requires an explicit request and an explicit accept from the other person (`app/home/kin.tsx`, `supabase/migrations/20260814000000_kin_connections.sql`).
- There is no public feed, no public profile, no stranger discovery of a user's challenge activity. Person search only surfaces identity + connection state, never activity.
- Visibility today is **binary, not per-post**: once two people are accepted Kin, each can see the other's current-challenge state and activity history (challenge started/succeeded/failed) and can react to it. There is no per-challenge audience picker in the shipped product (a more granular model exists only in an unreachable prototype) — see `docs/LAUNCH_READINESS.md` open decision #6 for whether that's the intentional public-launch design.
- Recipient/organizer invitation acceptance (the payment-side flow) is **completely separate** from Kin — accepting an invitation link never creates a Kin connection, never grants feed access, and never reveals challenge history. Confirmed directly in code: the invitation-acceptance path has no reference anywhere to `kin_connections` or `social_activity`.
- Blocking, reporting, and a server-side content filter on user-authored text (display names, challenge behavior/recipient-name text) are all implemented — see `docs/LAUNCH_READINESS.md`'s "Beta social-safety operations."

## Third-party service roles (for App Review's data-use questions)

| Provider | Role | Production or TEST/sandbox today |
|---|---|---|
| **Supabase** | Backend: Postgres database, authentication (email/password), Row-Level Security enforcing all data access, Edge Functions for trusted server-side logic, scheduled cron workers. | Real hosted project, but a TEST-tier project — not a separate production Supabase project yet. |
| **Stripe** | Payment method collection (SetupIntent/PaymentSheet) and the failure-consequence charge. Kinwin's own servers never see raw card data — Stripe's SDK and webhook are the only path. | **TEST mode only**, hard-enforced (`pk_test_`/`sk_test_` required; build fails otherwise). |
| **Tremendous** | Reward fulfillment: issues the gift-card-style reward to the named recipient/organizer after a failed challenge is charged. | **Sandbox/TestFlight environment only**, hard-enforced (`readTremendousSandboxConfig` rejects any non-sandbox base URL or non-`TEST_`-prefixed API key). |
| **Expo / EAS** | App build pipeline (EAS Build), the beta web fallback host (EAS Hosting at `kinwin-beta.expo.app`), and OTA-adjacent tooling. Not a data processor for user content. | N/A — infrastructure, not a data-handling third party in the App Review sense. |

## Reviewer test credentials — open question, not decided here

App Review will need a way to sign in and exercise the app. Kinwin's real sign-up flow requires email confirmation (a real, working email inbox) — there is no OAuth or guest mode. This means one of the following needs a founder decision before submission:

- **Option A:** Create one durable reviewer test account ahead of time (sign up with an email the founder controls, confirm it, optionally pre-populate a completed or in-progress challenge so review doesn't require walking the full payment flow from zero), and supply those credentials in App Review's "Sign-In information" field.
- **Option B:** Confirm email confirmation can be bypassed or fast-tracked for a specific reviewer address, if that's ever needed — not currently built, and probably unnecessary if Option A is used.

**Not decided here** — flagging as a required founder input before submission, not guessing an answer.

## Screenshots / visual assets still required

- **App icon and splash screen are currently engineering-only placeholders** — a deterministic solid dark-color square PNG generated by `scripts/beta-assets.cjs`, explicitly documented in that file as "not a substitute for real, approved Kinwin brand assets." Real brand assets (icon, splash, and any App Store marketing image) do not exist in this repository and need real design input — not something engineering can substitute for.
- App Store screenshots (all required device sizes) do not exist yet — confirmed no image assets anywhere in the repo for this purpose.
- No App Store preview video exists (optional, not required).

## Steps blocked only by Apple credentials/membership (nothing else needed)

**Corrected 2026-08-23 — see `docs/AI_HANDOFF.md`:** item 1 below was accurate when this section was
first written but is no longer true — Apple Developer Program enrollment is now approved
(founder-confirmed). Items 2–5 describe EAS-side provisioning state that has not been re-tested
since that approval; do not assume the 2026-08-16 failure quoted in item 5 still applies without
re-triggering the workflow.

1. ~~Apple Developer Program enrollment~~ — **RESOLVED, APPROVED.** No longer a blocker.
2. **One-time interactive EAS credentials setup** (`eas credentials` or one interactive `eas build`, Apple ID + 2FA) — no longer chained to enrollment (that's done); still needed if EAS doesn't already have a distribution certificate/provisioning profile for this project. Current state: not re-verified since enrollment approval. Every subsequent non-interactive CI run of the existing release workflow is expected to be unblocked permanently by this one manual step, once needed.
3. **Test device registration** (`eas device:create`) — needed because the beta build profile is ad-hoc/internal distribution (`eas.json`: `"distribution": "internal"`, `"simulator": false`). Current state: no record of this in this repo's GitHub Actions history, but a prior Kinwin build has already run on the founder's iPhone (founder-confirmed) via an undocumented mechanism — may already be done.
4. **Real Apple Team ID** — needed to generate the final Universal Links AASA file (`applinks:` entitlement is already wired in `app.config.js` for beta builds, but the deployed AASA content itself is deliberately not finalized until the real Team ID exists). Until then, the `kinwin://` custom URL scheme still works for manual testing, so this does not block first install, only the full real invitation-link walkthrough on a physical device.
5. **A completed build** — re-trigger the existing GitHub Actions workflow (`.github/workflows/eas-beta-release.yml`) for current evidence. Its last known result (2026-08-16, before enrollment approval) ran cleanly through every step up to the iOS build step itself, which failed with exactly: *"EAS CLI couldn't find any credentials suitable for internal distribution. Run this command again in interactive mode."* — that was the expected, correct failure mode at the time, but is stale evidence now that enrollment is approved.

Items 2–3 may require real Apple account interaction (Apple ID + 2FA) that cannot be done from
non-interactive CI. Re-triggering the existing release workflow first is the fastest way to learn
the current real state rather than assuming the 2026-08-16 result still holds.

## Maintenance note

This document is a snapshot for submission planning, not a living status tracker — `docs/LAUNCH_READINESS.md` remains the authoritative, continuously-maintained source for what blocks what. Re-derive the marketing copy, screenshots, and reviewer-credentials sections here fresh whenever an actual submission is imminent, rather than trusting this file to have stayed current.
