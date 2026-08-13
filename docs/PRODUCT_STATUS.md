# Kinwin Product Status

Evidence-based inventory as of main `84257be` (2026-08-13). Built from current code, migrations, deployed Edge Functions, tests, and release contracts — not from older doc prose, several of which are known to be stale (see [Known documentation drift](./LAUNCH_READINESS.md#known-documentation-drift) in `LAUNCH_READINESS.md`).

## How to read this document

Three documents each answer a different question. Don't duplicate across them:

- **`PRODUCT_DECISIONS.md`** — what Kinwin *should be*: locked product decisions, principles, constraints. Rarely changes.
- **`PRODUCT_STATUS.md`** (this document) — what *exists* today, what doesn't, and where it sits on the roadmap. Changes with every merged feature.
- **`LAUNCH_READINESS.md`** — what specifically *blocks* internal beta, external beta, or public App Store launch. A narrower, release-focused lens on a subset of what's below.

Status taxonomy used throughout:

| Status | Meaning |
|---|---|
| **IMPLEMENTED** | Real, working, reachable from the real app or a deployed release contract. |
| **IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION** | Code/schema is complete and deployed, but the real end-to-end path hasn't been observed to work once (usually blocked on external configuration or hardware). |
| **PARTIAL** | Some real, wired implementation exists, but a meaningful piece is missing or unreachable. |
| **NOT IMPLEMENTED — PLANNED** | Doesn't exist yet, and there's a clear, uncontroversial intent to build it. |
| **DEFERRED / POST-LAUNCH** | Doesn't exist yet, reasonable future want, not committed to a near-term package. |
| **PRODUCT DECISION NEEDED** | Building it (or how to build it) depends on a founder call engineering shouldn't make alone. |
| **SUPERSEDED / PROTOTYPE ONLY** | Exists only in a disconnected prototype or legacy screen not reachable from the real app; the real product either doesn't have this yet or solved it differently. |
| **OUT OF CURRENT SCOPE** | An old idea (usually from `SOCIAL_V1_SPEC.md`) with zero real implementation anywhere, not currently committed to at all. Not a promise it will never happen. |

"Not implemented" never means "must be built before launch" — that call belongs to `LAUNCH_READINESS.md` alone.

## Product at a glance

Today, a Kinwin user can: sign up, create a commitment challenge (a goal, a behavior, a measurable rule, a duration, one or more recipients, a consequence stake, and an explicit sit-out promise), authorize a Stripe TEST payment method, activate the challenge, check in against real server-tracked periods, and reach a real success or failure outcome. On failure, the app automatically charges the TEST card and — once Tremendous's hosted runtime configuration is set — fulfills a real reward that a chosen "canonical organizer" (a recipient or someone else) can accept and open. Separately, a user can build a private "Kin" network (friend-style connections found by search or an 8-character Kin code), see their Kin's current-challenge activity, and react to it. A Personal Playbook lets users save lessons tied to a completed challenge. None of this touches production money yet — Stripe and Tremendous are both TEST/sandbox by hard-coded design.

## Feature inventory

### 1. Account & identity

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Email signup | IMPLEMENTED | `contexts/auth-context.tsx` `signUp`, real Supabase Auth. | |
| Login | IMPLEMENTED | `signInWithPassword`. | |
| Session persistence | IMPLEMENTED | `getSession` + `onAuthStateChange`; `AuthGate` blocks routing until resolved. | |
| Logout | IMPLEMENTED | `signOut`, wired in `app/account/index.tsx`. | |
| Profile / display name | IMPLEMENTED | Editable, saved via `updateDisplayName`. | |
| Kin identity / Kin code / search identity | IMPLEMENTED | Unique 8-char code (`private.generate_kin_code`, legibility-filtered alphabet), person search by name/email, both real and RLS-protected. | |
| Email verification behavior | PARTIAL | Sign-up succeeds and shows a generic "sign in to continue" notice; no "check your email" state, no resend action. An unconfirmed account trying to sign in gets a generic "incorrect email/password" message — misleading if email confirmation is actually enforced on the hosted project. | Depends on hosted Supabase auth settings (not in repo); worth a small UX fix once confirmed relevant. |
| Password reset | NOT IMPLEMENTED — PLANNED | No `resetPasswordForEmail` call anywhere. Documented as a deliberate current limitation. | See `LAUNCH_READINESS.md` external-beta gate. |
| OAuth / social login | DEFERRED / POST-LAUNCH | Zero code. In-app copy literally says "Apple and Google sign-in come later." | |
| Account deletion | PRODUCT DECISION NEEDED | No UI, function, or migration. Restrictive foreign keys deliberately block cascading deletion through an active financial commitment. | See `LAUNCH_READINESS.md`'s seven data-retention questions before this can be built. |
| Account/settings functionality | IMPLEMENTED | `app/account/index.tsx` — display name, draft management, "show intro" toggle, sign out. | |
| Support/contact surface | NOT IMPLEMENTED — PLANNED | Confirmed absent anywhere in the app. | |
| Privacy policy / Terms surfaces | NOT IMPLEMENTED — PLANNED | No privacy policy or ToS document. A functional (not legally reviewed) consequence-disclosure exists in the creation flow — see §2. | |

### 2. Challenge creation

All fields below are captured across 13 screens in `app/create/*`. Only the final "Confirm commitment" tap on the review screen actually writes anything to the server — everything before that is local React context state (no autosave).

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Goal | IMPLEMENTED | Free-text, min 3 chars. | |
| Behavior / promise | IMPLEMENTED | Captured per-direction (`build.tsx`/`avoid.tsx`/`limit.tsx`). | |
| Direction | IMPLEMENTED | Build / Limit / Avoid → server enum `build`/`cut_back`/`stop`. | Client internally calls the middle one `'cut'`; only the domain/server layer says `cut_back` — a naming inconsistency worth knowing about, not a bug. |
| Measurement definition | IMPLEMENTED | Explicit for Limit (numeric + unit + period); auto-derived from the behavior text for Build/Avoid (no separate question). | |
| Rhythm / frequency | IMPLEMENTED | Daily / weekly-count / specific-days for Build; embedded in the Limit screen for cut-back. | |
| Duration | IMPLEMENTED | 2–12 weeks, quick picks or custom. Server re-validates the range. | |
| Success rule | IMPLEMENTED | Computed server/domain-side from direction + measurement (`domain/challenge/success-rule.ts`). | |
| Consequence category | IMPLEMENTED | Experience category (dinner/wellness/adventure/culture/getaway). | |
| Stake | IMPLEMENTED | USD amount, server enforces `currency = 'USD'`. | |
| Recipients | IMPLEMENTED | Up to 4 named recipients. | |
| Canonical organizer | IMPLEMENTED | Explicit selection screen — pick a recipient or name "someone else." Server re-validates the reference. | |
| Final review | IMPLEMENTED | Outcomes table (success/failure), suggested invite message. | |
| Consequence / sit-out consent | IMPLEMENTED | Required checkbox: *"If the challenge fails, the reward is for my recipients. I will not take part in their experience."* Re-validated server-side. | |
| Draft persistence | IMPLEMENTED | One explicit save on "Confirm commitment" (not autosave); stable draft ID reused on retry. | |
| Saved-draft resume | IMPLEMENTED | "Continue saved draft" loads the most recent non-archived draft, jumps straight to review. | |
| Start-over / cancel behavior | PARTIAL | No explicit "discard this draft" action anywhere — an unconfirmed draft just persists until resumed. Once confirmed, the draft is irreversibly archived. | Minor UX gap, not a functional blocker. |

### 3. Commitment & activation

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Draft → pending commitment | IMPLEMENTED | `prepare_challenge_from_draft` RPC, full server-side re-validation of every field. | |
| One pending commitment per owner | IMPLEMENTED | DB-level unique partial index; re-checked with a race-safe handler inside the RPC. | |
| Immutable recipients | IMPLEMENTED | No update path exists anywhere for `challenge_recipients` once inserted. | Changing recipients requires canceling and starting a fresh draft. |
| Pending commitment summary | IMPLEMENTED | `app/account/pending-commitment.tsx` — goal, success rule, stake → recipients, payment status. | |
| Cancellation | IMPLEMENTED | Idempotent RPC, confirm sheet, "no payment was taken" copy. Rows are never deleted, only status-flipped. | |
| Payment authorization requirement | IMPLEMENTED | Activation is blocked until a webhook-verified `authorized` consequence status exists. | |
| Real activation | IMPLEMENTED | `activate_challenge_draft(challenge_id, timezone)` — real RPC, confirmed idempotent (second call on an already-active challenge is a safe no-op). | |
| Timezone capture | IMPLEMENTED | Device IANA timezone, re-validated against tzdata server-side. | |
| Start/end dates | IMPLEMENTED | Computed at activation. | |
| Immutable activation snapshot | IMPLEMENTED | A JSONB snapshot (goal, rule, recipients, organizer, stake, consent, etc.) is written atomically with the `active` status flip. | |
| Generated challenge periods | IMPLEMENTED | Generated in the same transaction as activation, not by a separate trigger. | |
| Activation idempotency | IMPLEMENTED | Explicit status guard confirmed directly in the RPC. | |

### 4. Payments & membership

Consequence charging (real money mechanic) and membership billing (a separate, unbuilt concept) are kept distinct below.

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Stripe TEST configuration | IMPLEMENTED | `pk_test_`/`sk_test_` only; a build-time guard rejects anything else in the client bundle. | |
| SetupIntent / saved payment method | IMPLEMENTED | PaymentSheet flow, created/reused server-side. | |
| Signed webhook verification | IMPLEMENTED | HMAC-verified; the sole path to "paid" truth. | |
| Consequence authorization | IMPLEMENTED | Required before activation, independently re-verified. | |
| Off-session failed-challenge charging | IMPLEMENTED | Cron-scheduled hourly worker; a synchronous "succeeded" response is deliberately not trusted. | |
| Charge idempotency | IMPLEMENTED | Idempotency key per obligation + DB-unique constraints. | |
| Declined-payment retry (server) | IMPLEMENTED | Up to 3 attempts, 1h then 6h backoff, then `permanently_failed`. | |
| Declined-payment recovery (client UI) | PARTIAL | The recovery RPC (card-replacement for a stuck failed obligation) exists and is wired into `create-consequence-setup-intent`'s fallback path, but no screen or banner in the app ever surfaces "your payment failed, update your card." | Real gap — recovery is currently server/RPC-only, unreachable from the app. |
| Production/live Stripe | NOT IMPLEMENTED — PLANNED | Every environment and validation currently rejects anything but TEST. | Public-launch item; see `LAUNCH_READINESS.md`. |
| Membership entitlement | PARTIAL | `domain/membership/` defines `MembershipStatus`/`AccessMode` and a pure `accessModeFor()` function — no real billing populates `MembershipStatus`, so it always resolves to full access today. | |
| Subscription billing | PRODUCT DECISION NEEDED | No Stripe subscription, no App Store/Play billing webhook exists. Requires a current in-app-purchase rules review before any implementation — do not default to Stripe subscriptions. | |
| Completion Mode | PARTIAL | Fully defined (`AccessMode = 'completion'`, four gated capabilities) but has zero call sites anywhere in app/lib/Edge Function code — currently a no-op, designed but not wired to any runtime gate. | |
| Current supported currency | IMPLEMENTED | USD only, enforced by DB `CHECK` constraints across four migrations and client formatting. | |
| SEK / multi-currency | PRODUCT DECISION NEEDED | Deliberate current constraint, not a bug. | |

### 5. Active challenge experience

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Home | IMPLEMENTED | `app/home/index.tsx` — real hub, chooses active/pending/completed surface via `chooseHomeChallengeSurface`. | |
| Active challenge summary/detail | IMPLEMENTED | `app/home/challenge.tsx` — goal, identity, duration, progress, reporting-window copy, recipient statuses, invite sharing. | |
| Current period | IMPLEMENTED | Real server-tracked period state. | |
| Check-in | IMPLEMENTED | Real, via `append-check-in-event`; writes an actual event row, not local state. | |
| Correction / edit semantics | IMPLEMENTED | Append-only ledger — a correction inserts a new `event_type: 'correction'` row referencing the fact it corrects; there is no destructive edit/retract, and both first reports and corrections are blocked once the reporting window closes. | |
| Progress | PARTIAL | `app/home/progress.tsx` is a real, navigable screen reachable from the shipping Home tabs — but every number on it (streak, consistency %, weekly bars) comes from a static fixture (`fixtures/ux-v2-preview.ts`), not the user's real data. It also renders a "preview" tag. | **External beta blocker** (see `LAUNCH_READINESS.md`) — this is real and reachable, so it could easily be mistaken for genuine functionality by a tester. Must be connected to real data or removed/hidden from shipping navigation before outside testers get the app. |
| Reporting window | IMPLEMENTED | A period stays open for corrections/first reports until `reportingClosesAt`, a separate, later deadline than the period's own end. | |
| Recovery UX | **SUPERSEDED / PROTOTYPE ONLY** | `app/challenge/recovery.tsx` is *not* payment recovery — it's an old relapse-recovery planning screen (pick an obstacle + a coping strategy) built on the legacy fixture context, part of the orphaned `app/challenge/*` shell that nothing in the real app links to. | Don't confuse with the payment-recovery gap in §4, which is a real, separate issue. |
| Completion | IMPLEMENTED | Server-authoritative (see §6). | |
| Success result | IMPLEMENTED | `app/home/result.tsx`. | |
| Failure result | IMPLEMENTED | Same screen; shows the consequence block and reward-organizer sharing. | |
| New challenge / restart path | IMPLEMENTED | Home offers "+ Create challenge" once the prior one is terminal; gated by the one-pending-commitment rule if a draft is already mid-flight. | |
| Session / app-restart restoration | IMPLEMENTED | Active-challenge state is genuinely refetched from the server on every cold start once auth resolves — not just a cache read. | |

### 6. Challenge engine & automation

High-level; see `docs/CHECK_IN_ENGINE.md` and `docs/SCHEDULED_CHALLENGE_COMPLETION.md` for depth.

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Server-generated periods | IMPLEMENTED | SQL-only by design — no competing TypeScript implementation is allowed to exist. | |
| Check-in event model | IMPLEMENTED | Append-only, correction-aware (see §5). | |
| Evaluator | IMPLEMENTED | `domain/challenge/results.ts`'s `evaluateChallenge` — real, complete, all three directions. | |
| Scheduled completion | IMPLEMENTED | Cron every 15 min. | |
| Authenticated completion fast path | IMPLEMENTED | On-open opportunistic check, explicitly "defense in depth, not authoritative." | |
| Cron / workers | IMPLEMENTED | Four named jobs (completion, consequence payment, reward fulfillment, reward reconciliation), guarded to degrade gracefully if `pg_cron` is unavailable. | |
| Server-authoritative challenge truth | IMPLEMENTED | Client state is never trusted for a status transition. | |
| Duplicate / idempotency protections | IMPLEMENTED | Real DB-unique constraints and idempotency keys at every stage — check-ins, setup intents, charges, rewards, invitations. | |

### 7. Recipient & organizer access

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Recipient invitation | IMPLEMENTED | Per-recipient bearer token. | |
| Organizer invitation | IMPLEMENTED | Separate token for the canonical organizer. | |
| Bearer-token access | IMPLEMENTED | 43-char opaque token. | |
| Token hashing | IMPLEMENTED | Only a SHA-256 hash is ever persisted. | |
| Share again / rotation | IMPLEMENTED | Regenerating invalidates the previous token immediately. | |
| Accountless web access | IMPLEMENTED | `app/invite/[token].tsx` doubles as the web export target (Expo `output: 'single'`) — no separate HTML page. | |
| Accept | IMPLEMENTED | | |
| Decline | IMPLEMENTED | | |
| Canonical organizer role | IMPLEMENTED | Explicitly chosen at creation time (§2). | |
| Owner sit-out promise | IMPLEMENTED | Consent checkbox + server-side re-validation. | |
| Public invitation web fallback | IMPLEMENTED | Live at `https://kinwin-beta.expo.app`, HTTPS-verified (root and `/invite/<token>` both 200). | |
| Native Universal Link status | PARTIAL | iOS gets `associatedDomains` — but *only* in beta-gated builds (`KINWIN_VALIDATE_BETA=1`/`EAS_BUILD_PROFILE=beta`); a non-beta build has none. **Android has no App Links configuration at all** — only the custom `kinwin://` scheme, so an `https://` invitation link will never deep-link into the Android app today. | Real gap worth closing before Android testing. |
| Owner-facing invitation/progress state | IMPLEMENTED | `get_owner_reward_progress` RPC exposes exactly four states (`waiting_for_organizer`, `needs_attention`, `preparing`, `ready`) — no provider IDs or raw errors ever leak to the owner. | |

### 8. Reward fulfillment

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| One reward obligation per failed charged challenge | IMPLEMENTED | DB-unique constraint. | |
| Canonical organizer handoff | IMPLEMENTED | Reward access requires the organizer specifically, not any recipient. | |
| Tremendous adapter | IMPLEMENTED | | |
| Testflight-only enforcement | IMPLEMENTED | Base URL and API key format are hard-checked in code, not just convention. | |
| Fulfillment worker | IMPLEMENTED | Cron every 30 min. | |
| Reconciliation worker | IMPLEMENTED | Cron every 15 min. | |
| Idempotency | IMPLEMENTED | Four separate unique constraints (idempotency key, consequence, provider order, provider reward). | |
| LINK readiness | IMPLEMENTED | Reconciliation polls until Tremendous reports `SUCCEEDED`. | |
| Owner reward-progress states | IMPLEMENTED | See §7. | |
| Organizer "Open reward" | IMPLEMENTED | Generates a transient link on demand, with a 30-second cooldown against rapid double-taps. | |
| Transient reward URL handling | IMPLEMENTED | Confirmed directly in the function source: the URL is generated and returned, never written to any table. | |
| Real Testflight end-to-end verification | **IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION** | The whole pipeline above is real and deployed. What's missing is hosted runtime configuration (four secrets) on the TEST project — until set, `scheduled-fulfill-rewards`/`scheduled-reconcile-rewards` fail safely with HTTP 503 before any provider call. No full `completed_failure → ... → Open reward` chain has been observed live yet. | See `LAUNCH_READINESS.md`'s "Full core-loop verification gate" — this is the current operational blocker, not a code gap. |
| Production Tremendous | NOT IMPLEMENTED — PLANNED | Sandbox base URL is hard-rejected for anything else. | Public-launch item. |

### 9. Personal Playbook

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Lesson creation | IMPLEMENTED | | |
| Editing | IMPLEMENTED | | |
| Archive | IMPLEMENTED | | |
| Delete | IMPLEMENTED | Confirmed via native alert. | |
| Persistence | IMPLEMENTED | Real table, RLS-protected. | |
| Challenge/result linkage | IMPLEMENTED | A lesson can be tagged with the source challenge from the result screen. | |
| Recommendations / personalization | DEFERRED / POST-LAUNCH | Not built, not currently planned. | |

### 10. Kin / social

**Real, shipped feature** (all backed by real tables, RLS, and SECURITY DEFINER RPCs — reachable from the real `Home → Kin` tab):

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Kin connections | IMPLEMENTED | Request/accept/decline/remove/block state machine. | |
| Kin code | IMPLEMENTED | 8-char, legibility-filtered alphabet, unique per profile, backfilled and auto-assigned at signup. Fallback path in the UI, behind "Or share your Kin code instead." | |
| Search/add | IMPLEMENTED | By name or email. | |
| Request / accept / decline | IMPLEMENTED | | |
| Remove | IMPLEMENTED | | |
| Block | IMPLEMENTED | Works even with no prior connection; a blocked user can never redeem the blocker's Kin code again. | |
| Kin activity feed | IMPLEMENTED | | |
| Home Kin activity module | IMPLEMENTED | Capped preview on the main Home hub. | |
| Challenge-started / success / failure activity | IMPLEMENTED | Part of the same activity feed. | |
| Reactions | IMPLEMENTED | Fixed taxonomy (`respect|nice|worth_it|ouch|brutal`), one per user per activity item. | |
| Current challenge visibility | IMPLEMENTED | Any accepted Kin can see current-challenge state. | |
| Current privacy model | IMPLEMENTED | **Binary, not granular**: any accepted Kin sees all of your activity and current-challenge state. No per-post audience picker exists in the real product. | |

**Older, larger "Social v1" ideas — explicitly not the current implementation, classified individually so none of this silently becomes backlog:**

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Comments | SUPERSEDED / PROTOTYPE ONLY | Zero real schema; only an unused type definition in the disconnected prototype. | |
| Replies | SUPERSEDED / PROTOTYPE ONLY | Bundled with comments above. | |
| Challenge Rooms | SUPERSEDED / PROTOTYPE ONLY | One unreachable prototype screen; a stray UI-copy reference ("room settings") in the real app is the only trace. | |
| Per-challenge audience (Only me / All Kin / Selected Kin) | SUPERSEDED / PROTOTYPE ONLY | Fully modeled in the disconnected prototype (`lib/social/projection.ts`), never wired to the real backend. The shipped model is the simpler binary one above instead. | Whether that's the intentional final design is a product decision — see `LAUNCH_READINESS.md`. |
| Detail visibility (Exact / General / Progress only) | SUPERSEDED / PROTOTYPE ONLY | Same prototype as above. | |
| Social profiles / history pages | OUT OF CURRENT SCOPE | Not built anywhere, including the prototype. | |
| Reporting / moderation | PARTIAL | A relationship-level block exists and is tested; a content-report/moderation system does not. | Reasonable for current network size. |
| Kin-request / activity notifications | See §11 | | |
| Challenge invitations between Kin (inviting a Kin connection into your own challenge) | OUT OF CURRENT SCOPE | Zero code anywhere. Distinct from recipient/organizer invitations, which are real (§7). | |
| Joining someone else's challenge | OUT OF CURRENT SCOPE | Zero code anywhere. A challenge has exactly one owner today. | |
| Multi-participant "Kin Challenges" | OUT OF CURRENT SCOPE | Zero code or schema anywhere. | |
| Open joining | OUT OF CURRENT SCOPE | | |
| Late joining | OUT OF CURRENT SCOPE | | |
| Voting | OUT OF CURRENT SCOPE | Zero code trace anywhere, including the prototype. | |
| Shared final-event experience | OUT OF CURRENT SCOPE | | |
| "Revenge challenges" | OUT OF CURRENT SCOPE | Named once in the historical Social v1 feed-event list (`docs/SOCIAL_V1_SPEC.md`'s `revenge challenge started` event type); no real product definition, schema, screen, or implementation exists. | |

### 11. Notifications & engagement

Nothing in this domain is implemented. Stated plainly, per instructions:

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Local/scheduled reminders | DEFERRED / POST-LAUNCH | No `expo-notifications` local-notification usage or any custom reminder scheduling anywhere. | |
| Push notifications | DEFERRED / POST-LAUNCH | No push SDK integration anywhere. | |
| Check-in reminders | DEFERRED / POST-LAUNCH | | |
| Kin-request notifications | DEFERRED / POST-LAUNCH | Currently discoverable only by opening the Kin tab. | |
| Social activity notifications | DEFERRED / POST-LAUNCH | | |
| Result notifications | DEFERRED / POST-LAUNCH | | |
| Reward-ready notifications | DEFERRED / POST-LAUNCH | | |
| Neutral/sensitive notification wording | OUT OF CURRENT SCOPE | N/A — no notifications exist yet to have wording. | |

### 12. Analytics / support / operations

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| Analytics | DEFERRED / POST-LAUNCH | No analytics SDK in `package.json` or anywhere in code. | |
| Crash/error reporting | DEFERRED / POST-LAUNCH | No Sentry/Bugsnag/Crashlytics or equivalent. | |
| Support/contact surface | See §1 | Founder-facing support/contact channel for testers — tracked once in §1 as NOT IMPLEMENTED — PLANNED, an external-beta blocker. Not duplicated here. | See `LAUNCH_READINESS.md` external-beta gate. |
| Internal admin/ops dashboard | DEFERRED / POST-LAUNCH | No admin dashboard or internal ops screen anywhere in the app. No current repo or product-decision evidence that a dedicated admin UI is a committed near-term requirement — distinct from the founder-facing support surface above. | |
| Worker observability | PARTIAL | Real `service_role`-only SQL views exist (`private.reward_fulfillment_health` and others), but no UI — founder-facing or otherwise — surfaces them; they're queried manually. | |
| Release verification / evidence | IMPLEMENTED | Three real, working scripts: `verify:hosted-beta` (read-only smoke test of the hosted TEST project), `verify:tremendous:testflight` (opt-in real sandbox reward + idempotency proof), `verify:beta-universal-links` (AASA/Universal Link contract check). | |
| Operational tooling that exists | IMPLEMENTED | The three scripts above, plus `docs/BETA_TEST_ENVIRONMENT.md` as the maintained release contract (configuration inventory, migration/function/cron manifests, release-evidence checklist). | |

### 13. Platform & release surfaces

Implementation status only — release-blocking classification lives entirely in `LAUNCH_READINESS.md`.

| Feature | Status | Current behavior | Next / note |
|---|---|---|---|
| iOS app | IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION | Builds through every step except final signing. | Blocked on Apple Developer Program enrollment. |
| Android support | PARTIAL | Cross-platform Expo/React Native codebase, but no dedicated Android release contract, build profile, or App Links config exists yet (see §7's Universal Links gap). | |
| Expo / React Native foundation | IMPLEMENTED | | |
| EAS project | IMPLEMENTED | Linked (`@kinwin/kinwin-mobile`). | |
| EAS Hosting | IMPLEMENTED | Live beta web host, HTTPS-verified. | |
| Beta web invitation fallback | IMPLEMENTED | Deployed at `kinwin-beta.expo.app`. | |
| EAS internal build workflow | IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION | GitHub Actions workflow runs cleanly through hosting/config steps; the actual `eas build` step is blocked on Apple credentials. | |
| Apple Developer account | NOT IMPLEMENTED — PLANNED | Enrollment pending (external, founder-side). | |
| iOS signing | NOT IMPLEMENTED — PLANNED | EAS-managed credentials attempted automatically but none exist yet; needs one interactive setup once enrollment clears. | |
| Registered test device | NOT IMPLEMENTED — PLANNED | No device UDID registered yet; undocumented step, needs `eas device:create`. | |
| Apple Team ID | NOT IMPLEMENTED — PLANNED | Blocked on enrollment. | |
| AASA | PARTIAL | Deterministic generator script exists and works; requires the real Apple Team ID to produce final content — deliberately not deployed yet. | |
| Universal Links | PARTIAL | See §7 — iOS-only, beta-gated; Android has none. | |
| TestFlight | NOT IMPLEMENTED — PLANNED | Needs an App Store Connect app record + export-compliance answers first. | |
| App Store Connect | NOT IMPLEMENTED — PLANNED | No metadata, screenshots, or privacy-label prep exists yet. | |
| Production bundle identifier | PRODUCT DECISION NEEDED | Current identifier (`com.kinwin.mobile.beta`) is explicitly not the final one. | |

## Real user journeys currently available

- **Account → create challenge → payment authorization → activation.** Fully real end to end; the only external-runtime dependency is Stripe TEST (already configured and working).
- **Active challenge → check-ins → completion.** Fully real; server-authoritative throughout.
- **Failed challenge → Stripe consequence → reward pipeline.** Real through the Stripe charge. **Stops** at Tremendous fulfillment until the hosted TEST runtime secrets are configured (§8) — the charge succeeds, but no reward is ever created until then.
- **Add Kin → request → accept → activity → reaction.** Fully real end to end.
- **Invitation link → recipient/organizer acceptance → organizer reward access.** Real through acceptance and the owner-facing progress projection. **Stops** at the same Tremendous configuration point for the actual reward — the organizer can accept, but "Open reward" has nothing to open until fulfillment can run.
- **Physical iPhone install of any of the above.** **Stops before it starts** — blocked on Apple Developer Program enrollment and the one-time interactive EAS credentials setup (see `LAUNCH_READINESS.md`).

## Planned / deferred product work

Full release-blocking detail lives in `LAUNCH_READINESS.md` — this is a shorter roadmap-shaped view. Not reproducing every blocker here.

### Near-term
- Fix or remove the fixture-only "Progress" tab (§5) before it's mistaken for real functionality.
- A reachable client-side path to the existing payment-recovery RPC (§4).
- Password reset, support/contact surface (also external-beta blockers).

### Public-launch work
- Account deletion (pending the data-retention decisions).
- Privacy policy, Terms of Service.
- Apple signing chain, App Store Connect setup, production bundle identifier.
- Production Stripe/Tremendous provisioning (if real money is intended at launch).

### Post-launch expansion
- Push notifications and all notification types in §11.
- Analytics, crash reporting.
- OAuth/social login.
- Playbook recommendations/personalization.

### Ideas not currently committed to
- Comments, Challenge Rooms, per-challenge audience/detail controls (all prototype-only, superseded by the simpler shipped Kin model).
- Multi-participant Kin Challenges, open/late joining, voting, shared final events, challenge invitations between Kin, social profiles — all zero-code, `OUT OF CURRENT SCOPE`. None of this is the active backlog.

## Open product decisions

Only real decisions engineering shouldn't make automatically — full detail in `LAUNCH_READINESS.md`:

1. Account deletion semantics (active challenge, pending obligation, history retention, social activity, invitations, provider references, legally required records).
2. Subscription/membership payment-platform architecture — requires a current Apple/Google in-app-purchase rules review.
3. Currency scope beyond USD.
4. Whether the binary Kin-visibility model is the intentional public-launch design, or whether per-challenge audience control needs to ship first.
5. Production bundle identifier.
6. Distribution model for external beta (ad-hoc device registration vs. TestFlight).
7. Whether public launch is free or paid.

Not a founder product decision (listed here only for completeness): the Apple Team ID is an external platform/account value Apple assigns after Developer Program enrollment completes, not something engineering or the founder chooses as product design. Tracked as a Platform & release surfaces inventory item (§13), not here.

## Prototype / legacy inventory

Unreachable from the real app's navigation (`app/_layout.tsx`'s root `<Stack>` only registers `index`, `auth`, `invite`, `account`, `home`, `create`, `challenge`) or fixture-driven despite being technically routable:

- **`app/challenge-ux-preview/*`** — an entirely separate mock challenge-lifecycle UI, session-only fixtures.
- **`app/social-preview/*`, `app/social-onboarding-preview/*`, `domain/social/`, `lib/social/`, `components/social/`** — the one-day (2026-08-06) Social v1 UX prototype. Preserves the ideas in the "older Social v1 ideas" table above (comments, audience/detail controls, Challenge Rooms). Not imported by any reachable app code.
- **`app/challenge/*` (`active.tsx`, `check-in.tsx`, `recovery.tsx`, `playbook.tsx`)** — an orphaned legacy shell (confirmed by its own exclusion from `lib/copy/dash-guard.test.ts`'s real-product scan). Still technically registered in the root Stack, but nothing in the real app links to it. `check-in.tsx` is a fixture-driven duplicate of the real check-in flow at `app/home/*`; `recovery.tsx` is a relapse-recovery planning idea, unrelated to payment recovery.
- **`app/home/progress.tsx`** — see §5. Not a disconnected prototype in the same sense (it *is* wired into the real Home tabs) but its content is 100% fixture data — flagged separately because it's easy to miss.

## Source-of-truth hierarchy

1. Current running code, database, and deployed release contracts.
2. `PRODUCT_STATUS.md` (this document) — implementation status.
3. `PRODUCT_DECISIONS.md` — locked product decisions.
4. `LAUNCH_READINESS.md` — release gates.
5. Older UX/spec documents (`SOCIAL_V1_SPEC.md`, `SOCIAL_ONBOARDING_UX.md`, `SOCIAL_UX_V1.md`, `BACKEND_IMPLEMENTATION_PLAN.md`, etc.) — design/history only, unless a document is explicitly marked current.

## Maintenance rule

**Every future PR that materially adds, removes, or changes a product capability should update `docs/PRODUCT_STATUS.md` in the same PR.** This document is only useful if it stays current — treat a stale status here the same as a failing test.
