# Kinwin AI Handoff

**Read this file first, before planning any new work.** It is the concise, current-truth entry
point for a fresh Claude/Codex session. It is deliberately short — for full evidence-based detail
see `docs/PRODUCT_STATUS.md` (feature inventory) and `docs/LAUNCH_READINESS.md` (release-blocker
audit). If this file and either of those disagree, treat this file as more current and fix the
other one rather than trusting its older text (see `docs/AI_WORKFLOW.md`).

Last verified against: main `e2bde5264c6a450a2171b54d6602bd6b32f6b8cd` (2026-08-23).

## Current product state

The full challenge lifecycle (draft → payment-method setup → activation → check-ins →
completion/failure → Stripe TEST consequence charge → Tremendous TEST reward), Kin/social
(connections, activity feed, emoji reactions, comments, reporting/blocking), account deletion, and
auth (sign-up/in, password reset, email confirmation) are implemented and server-authoritative.
See `docs/PRODUCT_STATUS.md` for the full per-feature table.

**Shipped since the last full audit pass (`docs/LAUNCH_READINESS.md`/`docs/PRODUCT_STATUS.md`,
2026-08-13):**

- Real in-app account deletion (owner-level advisory lock, full owned-data cleanup, Admin API user
  removal) — PR #59.
- Core challenge experience polish (Home hierarchy, check-in UX, results/Playbook handoff) — PR
  #60.
- Self-service check-in corrections — PR #61.
- Payment-journey and Kin/social shipping-pass bugfixes — PRs #62, #63.
- Beta/App Store readiness package (submission planning doc, real Support page) — PR #64.
- Two EAS CLI/config bootstrap fixes (two-pass config deadlock, remote app-version source) — PRs
  #65, #66.
- P0 device-beta bugfixes (Review dead-end, Playbook nav/archive, Kin self-attribution, activation
  start date) — PR #67.
- Onboarding/commitment UX pass — PR #68.
- **Success Means V2** — versioned, user-adjustable success threshold for Build/Limit challenges,
  server-derived baseline, never weaker than Kinwin's computed floor — PR #69.
- Commitment/Home UX pass (launch continuity, account gate, Home hierarchy) — PR #70.
- Personal surfaces polish (Me, Playbook entry UX, People/Add Kin spacing) — PR #71.
- **Activity V1** — emoji reactions (🔥❤️😂😬👑, replacing the old word vocabulary) + lightweight
  flat comments on activity — PR #72.
- **Multi-currency V1** — USD/SEK/EUR commitments, no FX conversion, per-currency minimum stakes —
  PR #73.
- Commitment motion polish (hold-to-confirm activation, corrected haptic hierarchy, entrance
  transitions) — PR #74.
- Hosted-TEST database deploy workflow (`.github/workflows/supabase-test-deploy.yml`) — PR #75.

## Hosted Supabase TEST state — VERIFIED, do not redo

Migrations through **`20260908000000`** are deployed and independently verified on the hosted TEST
project (`ywoledppusxwdonwsewh`):

- `20260905000000_activation_starts_today.sql`
- `20260906000000_success_means_v2.sql`
- `20260907000000_activity_comments_and_emoji_reactions.sql`
- `20260908000000_multi_currency_v1.sql`

Deployed via `.github/workflows/supabase-test-deploy.yml` (manual `workflow_dispatch` only, gated
on exact-SHA checkout, machine-enforced migration-history checks, and an ordered dry-run match).
GitHub Actions run `32630487388` (attempt 2) — **success**. Its own hosted-verification step ran 35
hard-asserting SQL checks directly against the live database (function bodies, RLS, constraints,
grants) — **all 35 passed**, confirmed by reading the run's raw logs, not just its green checkmark.

**Do not re-deploy these migrations or re-run that verification** — it is done and confirmed. The
repository currently has 37 migration files total; `20260908000000` is the newest.

## Apple Developer / iOS state

- **Apple Developer Program enrollment: APPROVED** (founder-confirmed 2026-08-23). This was
  previously documented as "pending Apple identity verification" — that was true as of
  2026-08-13/16 and is **no longer true**. Do not repeat the old claim; several docs still needed
  correcting for this (see `docs/AI_WORKFLOW.md`'s reconciliation rule).
- **A prior version of Kinwin has already been installed and run on the founder's physical
  iPhone** (founder-confirmed). The exact distribution mechanism of that earlier install is not
  established from repository evidence — no record of a completed EAS build or device registration
  exists in this repo's GitHub Actions history. Do not invent how it was distributed; treat only
  the fact itself (a working iPhone install has existed before) as known.
- **CURRENT EAS SIGNING CREDENTIAL STATE: NOT YET RE-VERIFIED.** The most recent GitHub Actions run
  of `.github/workflows/eas-beta-release.yml` (run `31962015738`, 2026-08-16 — **before** the Apple
  approval above was confirmed) ran cleanly through EXPO_TOKEN auth, EAS project linkage, Stripe
  TEST key validation, and the beta web deploy, then failed only at the final `eas build` step:
  `"EAS CLI couldn't find any credentials suitable for internal distribution. Run this command
  again in interactive mode."` This is a narrower, EAS-specific credential-provisioning fact (no
  distribution certificate/provisioning profile exists yet on Expo's servers for this project), not
  evidence about Apple Developer Program status — that status has since changed. **This has not
  been re-tested since Apple approval.** Do not assume the same failure still applies; get fresh
  evidence instead of reasoning from the stale log.
- EAS project is already linked (`KINWIN_EAS_PROJECT_ID` repo variable is set); `EXPO_TOKEN`,
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (a `pk_test_...` key) are configured; the beta web host
  (`https://kinwin-beta.expo.app`) is live and HTTPS-verified. Build profile: `beta`, internal
  distribution, bundle ID `com.kinwin.mobile.beta`. This workflow builds an **internal EAS
  distribution** (ad-hoc `.ipa`) — it does **not** submit to TestFlight/App Store Connect; no such
  step exists in it today.

## What must NOT be redone

- Hosted TEST migration deployment through `20260908000000` and its semantic verification.
- Re-diagnosing "Apple Developer Program enrollment pending" as a blocker — it is approved.
- Re-implementing any of the shipped features listed above.

## Current genuine blocker

**Current EAS iOS signing-credential state is unknown post-Apple-approval.** The only way to get
real evidence is to dispatch `.github/workflows/eas-beta-release.yml` again (or run `eas
credentials -p ios` interactively) and read the actual result — not to reason from the 2026-08-16
log. This has been deliberately **not done** in the session that wrote this handoff (that session's
scope was documentation repair only).

## Next recommended task

Dispatch `.github/workflows/eas-beta-release.yml` against `main` and read the real outcome of the
`eas build` step. Two expected outcomes:

- It still fails on missing credentials → run the one-time interactive `eas credentials -p ios`
  (or one interactive `eas build`) — this requires the founder's Apple ID + 2FA and cannot be done
  from non-interactive CI — then re-trigger.
- It fails on missing device registration → run `eas device:create` for the founder's iPhone, then
  re-trigger.
- It succeeds → an internal-distribution `.ipa` exists; the next real question is how to get it
  onto the founder's iPhone (this workflow does not do that itself), and separately, whether the
  founder wants a TestFlight/App Store Connect submission path added (it does not exist yet).

Do not assume which of these applies — trigger it and read the actual log.
