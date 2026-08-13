# Kinwin Launch Readiness

Read-only audit as of main `d8ec43f` (2026-08-13). This is the authoritative status document — where it conflicts with other docs, trust this one and the evidence cited here, not older planning prose. See [Known documentation drift](#known-documentation-drift) for specifics.

Method: evidence from code, migrations, deployed Edge Functions, tests, and merged PRs — not doc claims. Preview/prototype routes (`app/challenge-ux-preview/*`, `app/social-onboarding-preview/*`, `app/social-preview/*`, and the legacy `app/challenge/check-in.tsx` fixture screen) are excluded from "shipping scope": none of them are reachable from `app/_layout.tsx`'s root `<Stack>`, which only registers `index`, `auth`, `invite`, `account`, `home`, `create`, `challenge`.

## Current shipping scope

**Auth** — email/password sign-up, sign-in, session persistence, sign-out (`contexts/auth-context.tsx`). No password reset, no OAuth, no magic link (also stated in `docs/IOS_BETA_BUILD.md`).

**Challenge lifecycle, end to end, server-authoritative:**
- Draft creation → 12-screen onboarding wizard (`app/create/*`), server RPC `prepare_challenge_from_draft` turns a draft into a pending commitment; only one pending commitment per owner is enforced server-side (`20260808000000_one_pending_commitment_per_owner.sql`).
- Stripe TEST payment-method setup via PaymentSheet (`app/account/payment-setup.tsx`), SetupIntent created/reused server-side, webhook-verified (`create-consequence-setup-intent`, `stripe-consequence-webhook`).
- Activation (`app/account/pending-commitment.tsx` → `20260811000000_full_activation.sql`) re-validates timezone and payment authorization server-side, not just trusting the client.
- Real check-ins write actual `check_in_events` rows via `append-check-in-event`, not local state. Period generation is SQL-only by design (`domain/challenge/check-in/periods.ts` deliberately leaves `GeneratePeriods` unimplemented client-side "so no competing TypeScript algorithm can ever drift from that one SQL function").
- `domain/challenge/results.ts`'s `evaluateChallenge` is a real, complete evaluator (build/cut-back/stop directions) — **not** the stub `docs/BACKEND_IMPLEMENTATION_PLAN.md` still describes.
- Completion is cron-scheduled (`kinwin-challenge-completion`, every 15 min) with an authenticated on-open fast path (`finalize-challenge`) as "defense in depth, not authoritative."
- Failure charging: `_shared/consequence-payment` — idempotency key per obligation, DB-unique constraints on `consequence_id` and `stripe_payment_intent_id`, and a synchronous Stripe "succeeded" response is deliberately **not** trusted — only the HMAC-verified webhook persists paid truth. Cron-scheduled hourly.
- Recipient invitation: 43-char bearer token, only its SHA-256 hash is persisted, token rotates (invalidating the old one) whenever a new one is issued (`create-recipient-invitation`, `create-organizer-invitation`).
- Reward fulfillment: Tremendous integration is **hard-coded to sandbox** — `readTremendousSandboxConfig` rejects any base URL other than `https://testflight.tremendous.com` and any API key not prefixed `TEST_`. Automated via cron (fulfillment every 30 min, reconciliation every 15 min), with real idempotency (`unique(idempotency_key)`, `unique(consequence_id)`, `unique(provider_order_id)`, `unique(provider_reward_id)`) and staged retry/terminal-failure handling.
- All of the above have unit tests (Node `--test`, fake adapters) and/or pgTAP-style SQL fixtures in `supabase/tests/`, wired into `package.json`'s `test`/`test:e2e` scripts — not orphaned.

**Personal Playbook** — fully implemented (create/edit/archive/delete lessons), linked from the completion screen and the profile tab.

**Kin (social) — real, ~1–5 days old at audit time:** friend connections (search by name/email or Kin code, request/accept/decline/remove/block), a shared activity feed, and reactions (`respect|nice|worth_it|ouch|brutal`) — all backed by real tables, RLS, and SECURITY DEFINER RPCs (`20260814000000_kin_connections.sql`, `20260815000000_social_activity.sql`, `20260817000000_kin_search_and_current_state.sql`), reachable from the real `Home → Kin` tab (`app/home/kin.tsx`). Visibility is **binary today**: any accepted Kin sees all of your activity and current-challenge state — there is no per-challenge audience selector in production (that model exists only in the unreachable prototype, see below).

**Beta release infrastructure** — EAS project linked (`@kinwin/kinwin-mobile`), `preview` environment fully configured (Supabase TEST URL/key, Stripe TEST publishable key, and a live EAS Hosting origin), a stable beta web host at `https://kinwin-beta.expo.app` (EAS Hosting, HTTPS-verified: root and `/invite/<token>` both return 200 — confirming Expo Router SPA fallback works there), and a manual GitHub Actions release workflow (`.github/workflows/eas-beta-release.yml`) that authenticates, links, configures environment, deploys the web host, and attempts the iOS build. **Currently blocked** at Apple credentials — see [Internal iPhone beta gate](#internal-iphone-beta-gate).

### Explicitly a separate, disconnected prototype — not shipping product

`domain/social/`, `lib/social/`, `components/social/`, `app/social-preview/*`, `app/social-onboarding-preview/*`, and `app/challenge-ux-preview/*` were built in short, self-contained bursts (the social prototype: 10 commits, all dated 2026-08-06), operate entirely on in-memory fixtures, and are not imported by any reachable app code. This is what `SOCIAL_V1_SPEC.md`'s "implementation has not started" line is describing, and it's still true for *that specific code path* — even though the real Kin feature it inspired has since shipped through a completely different implementation. `docs/SOCIAL_ONBOARDING_UX.md` and `docs/SOCIAL_UX_V1.md` correctly self-label as prototypes; only `SOCIAL_V1_SPEC.md`'s top-line status is misleading once you don't know about the real Kin feature.

## Internal iPhone beta gate

*Only what's needed to get the real app installed and exercised on an iPhone.*

| Item | Status |
|---|---|
| Apple Developer Program enrollment | **INTERNAL BETA BLOCKER** — external, founder-side, currently pending (per your context). Nothing engineering can do to accelerate this. |
| One-time interactive EAS credentials setup | **INTERNAL BETA BLOCKER**, chained to the above. `eas build` already correctly attempts EAS-managed remote iOS credentials (`✔ Using remote iOS credentials (Expo server)`) but fails non-interactively because none exist yet: *"EAS CLI couldn't find any credentials suitable for internal distribution. Run this command again in interactive mode."* One founder-run `eas credentials` (or one interactive `eas build`) — Apple ID + 2FA, EAS auto-generates the actual certificate/profile — permanently unblocks every future *non-interactive* run of the existing GitHub Actions workflow. |
| Test device registration | **INTERNAL BETA BLOCKER.** `eas.json`'s `beta` profile is `"distribution": "internal"` with `"simulator": false` — a real-device ad-hoc build. No device UDID has been registered yet (`eas device:create`), and this step isn't documented anywhere in the repo (checked `docs/IOS_BETA_BUILD.md`, `docs/BETA_TEST_ENVIRONMENT.md`, `eas.json`, the workflow file — no mention of UDIDs). Needs at minimum the founder's own iPhone registered before the first build can install on it. |
| A build that actually completes | Chained to the two items above — once credentials + device exist, the existing workflow should carry it the rest of the way; re-trigger and watch it. |
| Universal Links end-to-end on a real device | **INTERNAL BETA BLOCKER, conditional** — `docs/IOS_BETA_BUILD.md`'s own physical-device test sequence includes opening `/invite/<token>` links with the app installed. This needs the real `KINWIN_APPLE_TEAM_ID` (blocked on Apple enrollment, same as above) to generate and deploy the final AASA at `kinwin-beta.expo.app`. Until then, the `kinwin://` custom scheme still works for manual testing, so this doesn't have to block *first install*, only the *full* real-flow walkthrough. |
| `ITSAppUsesNonExemptEncryption` | **Not** a blocker here — EAS `internal` distribution is ad-hoc (direct `.ipa` install), it never goes through App Store Connect processing, so this warning is inert until the first TestFlight/App Store Connect upload. See External beta gate. |

Everything else in "Current shipping scope" above is already testable once the app is on a device — this gate is purely about the Apple signing chain and the AASA host you're waiting on.

## External beta gate

*Items needed before giving it to actual outside testers (beyond the founder/close circle testing via ad-hoc distribution).*

| Item | Status |
|---|---|
| Distribution model decision | **PRODUCT DECISION.** Ad-hoc "internal" distribution caps at ~100 registered devices per Apple membership year and needs each tester's UDID collected manually; TestFlight supports up to 10,000 external testers with no per-device registration, but requires an App Store Connect app record and export-compliance answers. Decide before scaling past a handful of testers. |
| `ITSAppUsesNonExemptEncryption` in `app.config.js`'s `ios.infoPlist` | **EXTERNAL BETA BLOCKER** — confirmed absent (`app.config.js`'s `ios` block has no `infoPlist` key at all). Required before the first App Store Connect / TestFlight upload will process cleanly. Small, mechanical fix. |
| App Store Connect app record | **EXTERNAL BETA BLOCKER** if going the TestFlight route (not needed for continued ad-hoc). Does not exist yet — confirmed no App Store metadata/screenshot/privacy-label files anywhere in the repo. |
| Password reset | **EXTERNAL BETA BLOCKER (recommended, not an Apple rule).** Confirmed absent — `contexts/auth-context.tsx` has no `resetPasswordForEmail` call anywhere, and `docs/IOS_BETA_BUILD.md` documents this as a deliberate current limitation. Fine for a founder-supported internal circle; a real gap once testers you can't personally walk through a reset are involved. Small, well-scoped Supabase Auth feature. |
| Support/contact surface | **EXTERNAL BETA BLOCKER.** Confirmed absent anywhere in the app (`app/account/index.tsx` checked in full — no support email, contact screen, or help link). Outside testers need a way to report problems. |
| Consequence-consent copy, legal-reviewed | **EXTERNAL BETA BLOCKER, soft.** Functional disclosure UI already exists in two places — a required outcomes-acknowledgment checkbox on `app/create/review.tsx`, and a separate consent screen at `app/account/payment-setup.tsx` — but `docs/PRODUCT_DECISIONS.md` itself flags this as *"a list of the data the copy must convey, not approved legal wording — final consent copy requires legal review before shipping."* Worth a real review once money moves between actual outside people. |
| TEST-only Stripe/Tremendous | **Not a blocker — intentional.** Staying on TEST/sandbox rails for the external beta is the correct, deliberate choice; `scripts/beta-public-config.cjs` actively rejects anything else at build time. Only becomes relevant at public launch. |

## Public App Store gate

*True requirements for public release — beyond internal/external beta.*

| Item | Status |
|---|---|
| Privacy policy | **PUBLIC LAUNCH BLOCKER.** Confirmed absent — zero matches for "privacy policy" anywhere in the repo. Apple requires a real, reachable privacy policy URL for App Store Connect submission. |
| Terms of Service | **PUBLIC LAUNCH BLOCKER.** No standalone ToS document exists; only the in-app consequence-disclosure copy noted above, which is explicitly not final legal wording. |
| **Account deletion** | **PUBLIC LAUNCH BLOCKER — flagging clearly per App Store Review Guideline 5.1.1(v): if account creation exists in the app (it does), Apple requires an in-app account-deletion path.** Confirmed absent everywhere — no UI, no Supabase function, no migration. `docs/SUPABASE_SCHEMA.md` already notes *"restrictive foreign keys intentionally prevent account deletion from cascading through an active financial commitment — a future trusted account-deletion workflow must resolve those records."* **Not implemented in this audit, by design** — see [Product decisions before public launch](#product-decisions-before-public-launch) for the specific Kinwin data questions that need a founder answer before this can be built. |
| `ITSAppUsesNonExemptEncryption` + export compliance | **PUBLIC LAUNCH BLOCKER** (same item as external beta; carried forward since it's required for every App Store Connect submission). |
| App Store Connect metadata, screenshots, privacy-nutrition-label declarations | **PUBLIC LAUNCH BLOCKER.** None exist yet — confirmed no relevant files anywhere in the repo. |
| Production bundle identifier | **PUBLIC LAUNCH BLOCKER.** Current identifier (`com.kinwin.mobile.beta`) is explicitly, deliberately not the final one — `docs/IOS_BETA_BUILD.md`: *"Confirm the production identifier before any production signing or listing."* |
| Production Supabase / Stripe / Tremendous environments | **PUBLIC LAUNCH BLOCKER, if real money is intended at launch.** None exist today; every current environment and every hard-coded validation in the codebase currently *rejects* anything but TEST/sandbox. This is a deliberate, correct safety property right now, and becomes a real provisioning + code-change task (e.g. `adapter.ts`'s sandbox-URL check needs a production path added, deliberately, when that day comes) at public launch. |
| Membership/subscription billing + payment-platform choice | **PRODUCT DECISION, and a launch blocker only if public launch is paid.** `domain/membership/` today is types and a pure access-mode function only — no Stripe subscription, no App Store/Play billing webhook exists. Do not assume Stripe subscriptions are valid App Store architecture for this; that needs a dedicated current-rules review before any implementation, exactly as scoped for this audit — not decided here. |
| Currency (USD only) | **PRODUCT DECISION, not automatically a blocker.** `SUPPORTED_CURRENCIES = ['USD']`, enforced at the database level via `CHECK` constraints across four migrations, plus hardcoded `$`/`en-US` formatting in the review screen. Deliberate current constraint per `docs/PRODUCT_DECISIONS.md`. Fine to launch USD-only in a USD market; blocks a SEK/multi-currency launch until addressed. |

## Product decisions before public launch

Decisions where engineering should not guess:

1. **Account deletion semantics.** The specific Kinwin questions that need real answers before this can be built — not invented here:
   - What happens to an **active challenge in progress** when the owner deletes their account?
   - What happens to a **pending financial obligation** (an unresolved consequence charge)?
   - Is **completed challenge history** retained, anonymized, or deleted, and for how long?
   - What happens to **social activity/reactions** visible to Kin — deleted, orphaned, anonymized?
   - What happens to **outstanding recipient/organizer invitations** tied to the deleting account?
   - What happens to **payment/provider references** (Stripe customer, Tremendous order history)?
   - Are there **legally or operationally required retained records** (e.g. for financial/tax purposes) that must survive account deletion regardless?
2. **Payment-platform architecture for any future membership/subscription billing.** Requires a dedicated review of current Apple/Google in-app-purchase rules before implementation — do not default to a Stripe subscription without that review.
3. **Distribution model for the external beta** — ad-hoc device registration vs. TestFlight (see External beta gate table).
4. **Currency scope for public launch** — USD-only vs. SEK vs. multi-currency.
5. **Whether public launch is free or paid** — determines whether membership billing is actually a launch blocker.
6. **Social scope beyond the current binary "all Kin see everything" visibility model** — is the simpler shipped model the intentional public-launch design, or does per-challenge audience control (Only me / All Kin / Selected Kin) need to ship before public users are exposed to it? The current model is a legitimate, smaller V1 (see below) — this is a call about user expectations at public-launch privacy stakes, not a technical necessity.
7. **Production Apple Team ID and final iOS bundle identifier naming.**

## Explicitly not required for first launch

The old `SOCIAL_V1_SPEC.md` scopes a much larger social product than what's shipped. None of the following have any real implementation (confirmed: not even in the disconnected prototype, for most of these) — none of them need to block internal beta, external beta, or a first public launch:

- **Comments/replies on challenges or activity** — zero real code or schema anywhere; only a lone unused type definition in the prototype.
- **Challenge Rooms** — zero implementation; only a UI-copy string ("room settings, mute, report, and block") and one unreachable prototype screen.
- **Group / multi-participant "Kin Challenges"** — zero code or schema anywhere, including the prototype. A challenge still has exactly one owner today.
- **Late joining / voting** — zero code trace anywhere, including the prototype. Pure spec idea.
- **Per-challenge audience controls (Only me / All Kin / Selected Kin) and detail-level controls (Exact / General / Progress-only)** — implemented only in the disconnected prototype (`lib/social/projection.ts`, `lib/social/challenge-audience.ts`), never wired to the real backend or navigation. The shipped product intentionally launched with a simpler binary model instead — a legitimate smaller V1, not an oversight (see product decision #6 above for whether that's the final call for public launch).
- **Social profiles / challenge history pages** — not built.
- **Push notifications** — no `expo-notifications` usage anywhere.
- **Analytics** — no analytics SDK integrated anywhere.
- **Formal abuse/reporting system** — a relationship-level `block_kin` mechanism exists and is tested; a content-report/moderation system does not, and isn't needed at this network size/stage.

## Known documentation drift

Do not treat these documents' status prose as current implementation truth:

- **`README.md`** — still says *"the project contains only a temporary landing page; no backend, sign-in, or payment integration exists yet"* and repeats this under "Not implemented yet." Last touched at the very first commit (`9f1e316`); never updated since. A one-line correction is included in this PR (see below) — the file is not otherwise rewritten.
- **`docs/PRODUCT_DECISIONS.md`**, "Current scope" section — claims *"No Stripe charging, Tremendous fulfillment, analytics, or push notifications are connected yet"* and that real activation *"remains unimplemented"*; both are contradicted by shipped code (`20260823000000_stripe_failure_charging.sql`, `20260827000000_tremendous_sandbox_fulfillment.sql`, `20260811000000_full_activation.sql`). It also has no mention at all of the Kin/social feature, which has since shipped.
- **`BACKEND_IMPLEMENTATION_PLAN.md`** — several phase write-ups are stale in a document whose other phases are accurate: Phase 3b (full activation) is written in future tense despite being implemented; Phase 6 explicitly (and incorrectly) claims `evaluateChallenge` "is currently a deliberate stub that always returns `evaluable: false`" — it is a complete, real evaluator; Phases 5, 9, and 10 (check-in append, reward fulfillment, invitations) read as not-started but are fully implemented and deployed. Phases 1–4 and 7 read as accurate.
- **`SOCIAL_V1_SPEC.md`** — line 3's *"Implementation has not started"* is misleading without the context above: it's accurate for the specific (disconnected, prototype) code path the spec describes, but a real, smaller-scoped Kin feature inspired by it has separately shipped to production.
- **Authoritative and current**: `docs/BETA_TEST_ENVIRONMENT.md` and `docs/IOS_BETA_BUILD.md` — cross-consistent, present-tense, and confirmed accurate against `app.config.js`, `eas.json`, and the deployed Edge Function list. Neither yet mentions the EAS Hosting origin (`kinwin-beta.expo.app`) established this session — not a contradiction, just not yet caught up.
- **Correctly self-labeled as prototypes, not stale**: `docs/SOCIAL_ONBOARDING_UX.md` and `docs/SOCIAL_UX_V1.md` both open with *"Nothing here is production code."*
- **Other docs checked and found current/consistent, no action needed**: `docs/RECIPIENT_INVITATION_ACCESS.md`, `docs/SCHEDULED_CHALLENGE_COMPLETION.md`, `docs/SUPABASE_SCHEMA.md`, `docs/TREMENDOUS_SANDBOX_FULFILLMENT.md`, `docs/PAYMENT_SETUP.md`, `docs/CHALLENGE_CHECKIN_UX.md`, `docs/PRODUCTION_DATA_MODEL.md`, `docs/STRIPE_FAILURE_CHARGING.md`, `docs/CHECK_IN_ENGINE.md`.

## Canonical end-to-end launch smoke flow

The real, currently-implemented path from signup to a completed reward roundtrip — useful as the manual physical-device test sequence once the Apple signing chain is unblocked:

1. Sign up → create a challenge draft (`app/create/*`) → pick a recipient and a stake → acknowledge the outcomes/consent checkbox on the review screen.
2. Set up a Stripe TEST payment method (PaymentSheet) → SetupIntent confirmed via webhook.
3. Activate the challenge (timezone captured, server re-validates payment authorization).
4. Check in through the period(s) — real `check_in_events` written server-side each time.
5. On a missed check-in / failed period, the challenge reaches `completed_failure` (scheduled worker, or the on-open fast path).
6. The hourly consequence-payment cron charges the Stripe TEST card (idempotent, webhook-confirmed truth).
7. The owner shares a recipient-invitation link (`/invite/<token>`, rotates on regeneration) via native Share.
8. The recipient opens the link (web fallback at `kinwin-beta.expo.app`, or the installed app via `kinwin://`/Universal Link once AASA is deployed) and accepts.
9. The reward-fulfillment cron creates a Tremendous TEST order for the accepted recipient/organizer; the reconciliation cron polls until the reward LINK is ready.
10. The recipient/organizer redeems the reward link (`organizer-reward-link`, generated on demand, never stored).

## Next recommended work packages

Ordered, prioritizing shipping over infrastructure:

1. **Unblock and complete internal iPhone beta.** Once Apple Developer Program enrollment finishes: run the one-time interactive `eas credentials` setup, register the founder's test device(s) (`eas device:create`), re-trigger the existing GitHub Actions workflow, and walk the full canonical smoke flow above on a real iPhone — including Universal Links once the real Apple Team ID is known and the AASA is redeployed. This is almost entirely founder/Apple-side action at this point, not new engineering.
2. **Minimal external-beta surface.** Password reset (small, well-scoped Supabase Auth addition), a support/contact surface in the app, `ITSAppUsesNonExemptEncryption` declared in `app.config.js`, and a real legal review of the existing consequence-consent copy. Small, concrete, unblocks giving the app to real outside testers.
3. **Public-launch package, after the product decisions above are answered.** Account deletion (once the seven data questions above are answered), App Store Connect setup (metadata, screenshots, privacy nutrition labels, production bundle identifier), a privacy policy and Terms of Service, and the production-environment provisioning decision (Supabase/Stripe/Tremendous) — each gated on an explicit founder decision, not an engineering guess.
