# Kinwin AI Handoff

**Read this file first, before planning any new work.** It is the concise, current-truth entry
point for a fresh Claude/Codex session. It is deliberately short — for full evidence-based detail
see `docs/PRODUCT_STATUS.md` (feature inventory) and `docs/LAUNCH_READINESS.md` (release-blocker
audit). If this file and either of those disagree, treat this file as more current and fix the
other one rather than trusting its older text (see `docs/AI_WORKFLOW.md`).

Last verified against: main `f5e72a85cda2f7a4f8126edf8acc3da4a3b0712f` (2026-08-24).

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
- **CURRENT EAS SIGNING CREDENTIAL STATE: RESOLVED — RE-VERIFIED 2026-08-24.** Re-dispatched
  `.github/workflows/eas-beta-release.yml` against main (run `32702201648`, head
  `f5e72a85cda2f7a4f8126edf8acc3da4a3b0712f`) — **conclusion: success, every step green, including
  `eas build`.** The build step's own log shows a real, already-provisioned Distribution Certificate
  (serial `336FEEE77211BB399DCFEA65F25B761D`, Apple Team `92T4YDT887` "Fredrik Lahti (Individual)",
  expires 2027-08-16) and Provisioning Profile (Developer Portal ID `F2XWJ8Q6FF`, status active,
  one device already registered: UDID `00008110-0011184A1411401E`) already existed on Expo's
  servers — both last updated ~7 days before this run (around 2026-08-17), i.e. **not** set up by
  this workflow and not recorded anywhere in this repo's GitHub Actions history. That timing lines
  up with the founder-confirmed prior physical-iPhone install above — that install is most likely
  what created these credentials, via an interactive `eas build`/`eas credentials` run outside CI.
  The build itself completed (`✔ Build finished`) — result:
  https://expo.dev/accounts/kinwin/projects/kinwin-mobile/builds/1b8c85be-09c8-4653-904f-40fa69876cbb.
  **This step is no longer a blocker of any kind.**
- EAS project is already linked (`KINWIN_EAS_PROJECT_ID` repo variable is set); `EXPO_TOKEN`,
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (a `pk_test_...` key) are configured; the beta web host
  (`https://kinwin-beta.expo.app`) is live and HTTPS-verified. Build profile: `beta`, internal
  distribution, bundle ID `com.kinwin.mobile.beta`. This workflow builds an **internal EAS
  distribution** (ad-hoc `.ipa`) — it does **not** submit to TestFlight/App Store Connect; no such
  step exists in it today.

## What must NOT be redone

- Hosted TEST migration deployment through `20260908000000` and its semantic verification.
- Re-diagnosing "Apple Developer Program enrollment pending" as a blocker — it is approved.
- Re-diagnosing EAS iOS signing credentials as missing/blocked — re-verified working 2026-08-24
  (run `32702201648`); do not re-run `eas credentials` or treat this as unresolved.
- Re-implementing any of the shipped features listed above.

## Current genuine blocker

**None known for internal iPhone beta.** As of 2026-08-24, the full pipeline — EXPO_TOKEN auth,
EAS project linkage, Stripe TEST key, beta web deploy/verify, and the iOS build itself — has been
freshly, directly observed to succeed end to end (run `32702201648`). A real internal-distribution
build exists:
https://expo.dev/accounts/kinwin/projects/kinwin-mobile/builds/1b8c85be-09c8-4653-904f-40fa69876cbb.

What remains genuinely unverified (not "blocked," just not yet observed):

- Whether that specific build has actually been installed on the founder's iPhone and exercised —
  the founder-confirmed prior install may or may not be this exact build.
- The full failure→reward Tremendous chain end to end on a real device (see
  `docs/LAUNCH_READINESS.md`'s "Full core-loop verification gate").
- Universal Links on a real device — still needs the real `KINWIN_APPLE_TEAM_ID` pulled into this
  repo/deployment (not itself blocked on anything, just not done yet).
- TestFlight/App Store Connect submission — this workflow does not do that; no such step exists in
  it today, so it remains genuinely not-yet-built if that distribution path is wanted.

## Next recommended task

Install the build at the URL above on the founder's iPhone (if not already the same one from the
prior confirmed install) and walk `docs/LAUNCH_READINESS.md`'s "Canonical end-to-end launch smoke
flow" on a real device — that's the next thing that's genuinely unobserved, not the build/signing
pipeline, which is now confirmed working.
