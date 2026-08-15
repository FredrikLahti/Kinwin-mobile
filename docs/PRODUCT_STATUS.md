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

Today, a Kinwin user can: sign up, create a commitment challenge (a goal, a behavior, a measurable rule, a duration, one or more recipients, a consequence stake, and an explicit sit-out promise), authorize a Stripe TEST payment method, activate the challenge, check in against real server-tracked periods, and reach a real success or failure outcome. On failure, the app automatically charges the TEST card and, with Tremendous's hosted TEST runtime now configured, fulfills a reward that a chosen "canonical organizer" (a recipient or someone else) can accept and open — though that full chain has not yet been observed live end to end on the hosted project. Separately, a user can build a private "Kin" network (friend-style connections found by search or an 8-character Kin code), see their Kin's current-challenge activity, and react to it. A Personal Playbook lets users save lessons tied to a completed challenge. None of this touches production money yet — Stripe and Tremendous are both TEST/sandbox by hard-coded design.

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
| Email verification behavior | IMPLEMENTED | `signUp` checks whether Supabase actually returned a session (`data.session === null` means confirmation is required) instead of assuming — the auth screen shows a distinct "Check your email to confirm your account" state with a real "Resend confirmation email" action (`supabase.auth.resend`), and sign-in maps GoTrue's real `Email not confirmed` error to its own honest message instead of a generic "incorrect email/password." | |
| Password reset | RESOLVED — REAL HOSTED ROUND TRIP VERIFIED 2026-08-15 | Real Supabase flow: `app/auth/forgot-password.tsx` calls `resetPasswordForEmail` with enumeration-safe copy; the emailed link opens `app/auth/reset-password.tsx` (reachable via the same https:// web origin the recipient-invitation fallback already uses), which establishes the recovery session (`setSession` from the link's access/refresh token, implicit flow — see `lib/supabase/client.ts`'s `flowType` comment for why PKCE would not work across Kinwin's actual app→email→browser redirect paths) and calls `updateUser` to set the new password. Also fixed a real routing bug this correction pass found: establishing the recovery session was flipping the shared `status` to a plain `'signed_in'`, which would have let ambient "if signed in, redirect away" checks in `app/index.tsx` and `app/auth/index.tsx` yank the user off this screen before they could set a new password — a new `'password_recovery'` status (`lib/auth/derive-auth-status.ts`) keeps those checks from firing during recovery. The hosted TEST Supabase project's Auth → Redirect URLs allowlist includes this app's reset-password URL. | The founder has manually completed a live end-to-end round trip against the hosted TEST project (request reset → receive email → open link → reset password) and confirmed it worked. |
| OAuth / social login | DEFERRED / POST-LAUNCH | Zero code. In-app copy literally says "Apple and Google sign-in come later." | |
| Account deletion | PRODUCT DECISION NEEDED | No UI, function, or migration. Restrictive foreign keys deliberately block cascading deletion through an active financial commitment (verified across every migration: `on delete restrict` from every challenge/payment/reward table, `on delete cascade` only for Kin connections/social activity/reactions/Playbook). A full decision package with recommended options now exists in `docs/ACCOUNT_DELETION_DECISIONS.md`. | See that document's "Founder decisions required" section (5 items) before this can be built. Not implemented in this package, by design. |
| Account/settings functionality | IMPLEMENTED | `app/account/index.tsx` — display name, draft management, "show intro" toggle, sign out. | |
| Support/contact surface | IMPLEMENTED | Real "Contact Kinwin" row in `app/account/index.tsx`, wired to open a `mailto:` link to `EXPO_PUBLIC_SUPPORT_EMAIL`, which is now `support@kinwin.app`. `lib/support/config.ts` still reads the env var (never hardcoded) and would fall back to "not configured" honestly if it were ever unset again. `scripts/beta-public-config.cjs` now requires a real-looking support email for any beta build, and `eas-beta-release.yml` wires it into the EAS preview environment and both local pre-flight steps. | |
| Privacy policy surface | PARTIAL | `app/legal/privacy.tsx` is a real, publicly reachable (no sign-in required) factual DRAFT built strictly from `docs/PRIVACY_DATA_INVENTORY.md`, linked from Account settings; explicitly self-labeled as a draft. A functional (not legally reviewed) consequence-disclosure also exists in the creation flow — see §2 and `docs/PRODUCT_DECISIONS.md`'s gap analysis. | Not yet a finished, publication-ready policy satisfying Apple Guideline 5.1.1 — its retention/deletion story is incomplete because account deletion isn't implemented yet, not because it lacks a lawyer's sign-off (Apple's rule doesn't require legal review). Conditional external-TestFlight blocker as well as a public-launch one — see `LAUNCH_READINESS.md`. A separate legal review of the final wording is recommended before public real-money launch. |
| Custom Kinwin Terms of Service | PRODUCT DECISION NEEDED | No custom Kinwin Terms exist today. Apple applies its own standard EULA to App Store Connect submissions by default when no custom EULA is supplied, so this is not a generic Apple technical requirement. The previous unlinked internal-placeholder route (`app/legal/terms.tsx`) has been removed from the shipping app in this pass — Apple's App Review guidance discourages placeholder/incomplete content, and there was no product need to ship it. | Whether Kinwin's consequence/payment/reward model needs its own Terms before real-money public launch is a legal/business decision requiring real review, not an engineering assumption. |

### 2. Challenge creation

All fields below are captured across 13 screens in `app/create/*`. Only the final "Confirm commitment" tap on the review screen actually writes anything to the *server* — everything before that lives in local React context state. That in-progress state is now quietly autosaved to on-device storage as the user moves through the flow (`lib/challenge-creation/creation-session.ts`, keyed per signed-in user), independent of the separate, complete-draft server concept described in the "Draft persistence" row below — see "Exit / resume navigation."

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
| Saved-draft resume | IMPLEMENTED | "Continue saved draft" (Account) loads the most recent non-archived *server* draft, jumps straight to review. Distinct from local session resume below. | |
| Exit / resume navigation | IMPLEMENTED | Every step from Goal through Review has a Back (one step, state preserved) and a Close/X. Close with meaningful progress shows a non-alarming "Leave challenge setup?" sheet (Return home / Keep editing) instead of silently discarding anything; a separate "Discard draft instead" path requires its own confirmation. Unfinished progress autosaves locally (`lib/challenge-creation/creation-session.ts`) and is offered back via a "Challenge in progress" sheet (Continue / Start a new challenge, the latter gated behind an explicit destructive confirmation) the next time `+ Create challenge` is tapped on Home — never silently reset. Intro has its own Back to Home; nothing is entered there yet, so no confirmation is needed. Once a challenge is actually confirmed into a real pending commitment (Review → Share), the local snapshot is cleared so it can't resurface as a stale duplicate. | |
| Start-over / cancel behavior | RESOLVED | Explicit "Discard draft" actions now exist both inside the creation flow and from Home's resume prompt, each behind its own confirmation. See "Exit / resume navigation." | |

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
| Declined-payment recovery (client UI) | IMPLEMENTED | `get_owner_payment_status` (new RPC, owner-scoped, coarse `not_applicable`/`processing`/`needs_attention`/`paid` states only — never exposes provider ids or raw statuses) surfaces the gap on Home and the result screen; "Update payment method" opens `app/account/payment-recovery.tsx`, which reuses the existing SetupIntent/PaymentSheet path and the server's own card-replacement recovery contract. Also extended that recovery contract (`prepare_consequence_recovery_setup` and friends) to cover the `permanently_failed` terminal state, not just `requires_payment_method`/`requires_action` — previously a card stuck past all 3 automatic retries had no recovery path at all. A correction pass fixed a real timing mismatch: the obligation now transitions out of `needs_attention` the moment the webhook verifies the replacement card (inside `apply_consequence_recovery_setup_event`), not whenever the payment worker's next hourly tick happens to notice — proven end-to-end in `supabase/tests/320_owner_payment_recovery.sql` without waiting for a worker run. The webhook/worker remain the sole source of payment truth throughout; this screen never claims the consequence is paid, only that the card was saved, and never shows a raw Stripe SDK error. | |
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
| Progress | SUPERSEDED / PROTOTYPE ONLY | The fixture-driven screen was moved out of `app/` entirely, to `fixtures/previews/home-progress-preview.tsx` — it is no longer a registered route (the `Tabs.Screen` entry was removed from `app/home/_layout.tsx`), so it is no longer reachable from the shipping app at all, by URL or otherwise. No replacement stats screen was added; a real progress/statistics feature remains unbuilt. | Fixed the reachable-fixture gap (see `LAUNCH_READINESS.md`). Building a real progress feature is separate, undecided future work. |
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
| Public invitation web fallback | IMPLEMENTED — NEEDS POST-DEPLOY FUNCTIONAL VERIFICATION | Live at `https://kinwin-beta.expo.app`, HTTPS-verified (root and `/invite/<token>` both 200). **HTTP 200 only proves routing, not that the page works**: a 2026-08-15 Metro bundler cache bug in `eas-beta-release.yml` was found to ship a build with no Supabase config inlined, silently passing the HTTP-200 checks while both this page's real invitation lookup and Sign in were broken. The release pipeline now carries a permanent fix (`--clear` on the real export) and a permanent pre-deploy guard (verifies the exported bundle actually contains the TEST Supabase config before deploying) — see `docs/BETA_TEST_ENVIRONMENT.md`. Functionally spot-check Sign in and an invitation link after each release that touches the web export, the same as any deploy. | |
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
| Real Testflight end-to-end verification | **IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION** | The whole pipeline above is real and deployed, and the four Tremendous Testflight runtime secrets are now configured on the hosted TEST project — `scheduled-fulfill-rewards`/`scheduled-reconcile-rewards` no longer fail with HTTP 503 for missing config. What's still missing is observation: no full `completed_failure → ... → Open reward` chain has actually been run and watched live on the hosted project yet. | See `LAUNCH_READINESS.md`'s "Full core-loop verification gate" — this is now a verification step, not a configuration gap. |
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
| Reporting / moderation | IMPLEMENTED | A relationship-level block (`block_kin`), a real report affordance in `app/home/kin.tsx` (from an activity item or from a Kin's profile), backed by `public.submit_social_report` and a `service_role`-only `private.social_reports` table, and a trusted server-side content filter at the write boundaries where user-authored text becomes visible to Kin (`private.contains_disallowed_content`) — see `supabase/migrations/20260902000000_social_reports_and_content_filter.sql` and `LAUNCH_READINESS.md`'s "Beta social-safety operations." No admin dashboard; open reports are reviewed manually via a `service_role` session. Apple App Review Guideline 1.2's fourth item, published contact info, is also resolved now (`EXPO_PUBLIC_SUPPORT_EMAIL` = `support@kinwin.app`). | |
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
| Support/contact surface | See §1 | Founder-facing support/contact channel for testers — tracked once in §1 as IMPLEMENTED. Not duplicated here. | See `LAUNCH_READINESS.md` external-beta gate. |
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
| EAS Hosting | IMPLEMENTED | Live beta web host, HTTPS-verified. | See the 2026-08-15 regression/safeguards note in §7. |
| Beta web invitation fallback | IMPLEMENTED | Deployed at `kinwin-beta.expo.app`. | See the 2026-08-15 regression/safeguards note in §7. |
| EAS internal build workflow | IMPLEMENTED — NEEDS REAL-WORLD VERIFICATION | GitHub Actions workflow runs cleanly through hosting/config steps; the actual `eas build` step is blocked on Apple credentials. | |
| Apple Developer account | NOT IMPLEMENTED — PLANNED | Enrollment pending (external, founder-side). | |
| iOS signing | NOT IMPLEMENTED — PLANNED | EAS-managed credentials attempted automatically but none exist yet; needs one interactive setup once enrollment clears. | |
| Registered test device | NOT IMPLEMENTED — PLANNED | No device UDID registered yet; undocumented step, needs `eas device:create`. | |
| Apple Team ID | NOT IMPLEMENTED — PLANNED | Blocked on enrollment. | |
| AASA | PARTIAL | Deterministic generator script exists and works; requires the real Apple Team ID to produce final content — deliberately not deployed yet. | |
| Universal Links | PARTIAL | See §7 — iOS-only, beta-gated; Android has none. | |
| TestFlight | NOT IMPLEMENTED — PLANNED | Needs an App Store Connect app record + export-compliance answers first. | |
| App Store Connect | NOT IMPLEMENTED — PLANNED | No metadata, screenshots, or privacy-label prep exists yet. A working App Store Privacy declaration map exists in `docs/PRIVACY_DATA_INVENTORY.md` to prepare for the real questionnaire, but it is not itself a submission. | |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | IMPLEMENTED | `app.config.js` declares `ios.config.usesNonExemptEncryption: false`, justified by direct dependency/code inspection (HTTPS/TLS-only networking, Stripe's standard native SDK, `expo-crypto`'s `randomUUID()` only, no custom/bundled cryptography anywhere in the app). Verified the evaluated Expo config actually contains the expected value. | |
| Production bundle identifier | PRODUCT DECISION NEEDED | Current identifier (`com.kinwin.mobile.beta`) is explicitly not the final one. | |

## Real user journeys currently available

- **Account → create challenge → payment authorization → activation.** Fully real end to end; the only external-runtime dependency is Stripe TEST (already configured and working).
- **Active challenge → check-ins → completion.** Fully real; server-authoritative throughout.
- **Failed challenge → Stripe consequence → reward pipeline.** Real through the Stripe charge. The Tremendous TEST runtime secrets are now configured (§8), so fulfillment can run — but the full chain has not yet been observed live on the hosted project.
- **Add Kin → request → accept → activity → reaction.** Fully real end to end.
- **Invitation link → recipient/organizer acceptance → organizer reward access.** Real through acceptance and the owner-facing progress projection. Fulfillment can now run with Tremendous configured, but "Open reward" has not yet been exercised against a real hosted reward.
- **Physical iPhone install of any of the above.** **Stops before it starts** — blocked on Apple Developer Program enrollment and the one-time interactive EAS credentials setup (see `LAUNCH_READINESS.md`).

## Planned / deferred product work

Full release-blocking detail lives in `LAUNCH_READINESS.md` — this is a shorter roadmap-shaped view. Not reproducing every blocker here.

### Near-term
- A real progress/statistics feature — the fixture-only prototype was removed from shipping navigation (§5), but nothing real replaces it yet.
- Observe the Tremendous failure→reward chain end to end on the hosted TEST project for the first time (§8) — runtime configuration is done, but the chain has not yet been run and watched live.

### Public-launch work
- Account deletion implementation (decision package exists in `docs/ACCOUNT_DELETION_DECISIONS.md`; still pending the five founder decisions it closes with). Conditionally an external-beta requirement too, not only a public-launch one, if the distribution-model decision lands on TestFlight (Apple Guideline 2.2) — see `LAUNCH_READINESS.md`.
- Finishing the Privacy policy into a publication-ready document satisfying Apple Guideline 5.1.1 (`app/legal/privacy.tsx` currently self-labels as a factual DRAFT with an incomplete retention/deletion story). Also a conditional external-TestFlight blocker, not only public-launch, if TestFlight is the chosen distribution model. A separate legal review of the final wording is recommended before public real-money launch, but is not itself the Apple requirement.
- Legal/business decision on whether Kinwin needs a custom Terms document at all, given Apple's standard-EULA fallback — not a generic App Store requirement.
- Legal review of the consequence-consent/payment/reward copy before real money is at stake for outside people — not an external TEST-beta blocker (see `LAUNCH_READINESS.md`).
- Apple signing chain, App Store Connect setup (metadata, screenshots, privacy nutrition label using `docs/PRIVACY_DATA_INVENTORY.md`'s working map), production bundle identifier.
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

1. Account deletion semantics — see `docs/ACCOUNT_DELETION_DECISIONS.md`'s 5-item "Founder decisions required" section (completed-history model, whether the existing Kin-connection cascade is acceptable, minimal retained-record design and retention length, whether to block deletion during any non-terminal state, and recipient display-name retention).
2. Subscription/membership payment-platform architecture — requires a current Apple/Google in-app-purchase rules review.
3. Currency scope beyond USD.
4. Whether the binary Kin-visibility model is the intentional public-launch design, or whether per-challenge audience control needs to ship first.
5. Production bundle identifier.
6. Distribution model for external beta (ad-hoc device registration vs. TestFlight) — also determines whether item 1 above becomes required before that step, not only at public launch. UGC/social compliance (Apple Guideline 1.2) is largely resolved already and not gated on this choice.
7. Whether public launch is free or paid.

Not a founder product decision (listed here only for completeness): the Apple Team ID is an external platform/account value Apple assigns after Developer Program enrollment completes, not something engineering or the founder chooses as product design. Tracked as a Platform & release surfaces inventory item (§13), not here.

## Prototype / legacy inventory

Unreachable from the real app's navigation (`app/_layout.tsx`'s root `<Stack>` only registers `index`, `auth`, `invite`, `account`, `home`, `create`, `challenge`) or fixture-driven despite being technically routable:

- **`app/challenge-ux-preview/*`** — an entirely separate mock challenge-lifecycle UI, session-only fixtures.
- **`app/social-preview/*`, `app/social-onboarding-preview/*`, `domain/social/`, `lib/social/`, `components/social/`** — the one-day (2026-08-06) Social v1 UX prototype. Preserves the ideas in the "older Social v1 ideas" table above (comments, audience/detail controls, Challenge Rooms). Not imported by any reachable app code.
- **`app/challenge/*` (`active.tsx`, `check-in.tsx`, `recovery.tsx`, `playbook.tsx`)** — an orphaned legacy shell (confirmed by its own exclusion from `lib/copy/dash-guard.test.ts`'s real-product scan). Still technically registered in the root Stack, but nothing in the real app links to it. `check-in.tsx` is a fixture-driven duplicate of the real check-in flow at `app/home/*`; `recovery.tsx` is a relapse-recovery planning idea, unrelated to payment recovery.
- **`fixtures/previews/home-progress-preview.tsx`** (formerly `app/home/progress.tsx`) — see §5. Moved out of `app/` and out of `app/home/_layout.tsx`'s tab registration specifically so it has no route and cannot be reached from the shipping app; kept as a design reference only.

## Source-of-truth hierarchy

1. Current running code, database, and deployed release contracts.
2. `PRODUCT_STATUS.md` (this document) — implementation status.
3. `PRODUCT_DECISIONS.md` — locked product decisions.
4. `LAUNCH_READINESS.md` — release gates.
5. Older UX/spec documents (`SOCIAL_V1_SPEC.md`, `SOCIAL_ONBOARDING_UX.md`, `SOCIAL_UX_V1.md`, `BACKEND_IMPLEMENTATION_PLAN.md`, etc.) — design/history only, unless a document is explicitly marked current.

## Maintenance rule

**Every future PR that materially adds, removes, or changes a product capability should update `docs/PRODUCT_STATUS.md` in the same PR.** This document is only useful if it stays current — treat a stale status here the same as a failing test.
