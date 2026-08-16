# Kinwin Privacy Data Inventory

Evidence-based inventory of what Kinwin actually collects, stores, and sends to third parties today, as of main `75268fd` plus the account-deletion package (`docs/ACCOUNT_DELETION_DECISIONS.md`). Built from the real Postgres schema (`supabase/migrations/`), Edge Functions (`supabase/functions/`), and client code — not from assumption or a generic privacy-policy template. Where a fact is not yet decided (mainly ongoing retention while an account is active), it is marked `RETENTION DECISION NEEDED` rather than invented. See `docs/ACCOUNT_DELETION_DECISIONS.md` for the deletion-specific decisions this inventory previously fed, now implemented.

**Account deletion is now real** (`app/account/delete-account.tsx`, `supabase/functions/delete-account`): once every challenge/payment/reward obligation on an account is genuinely terminal, deleting the account hard-deletes essentially everything in this inventory that is linked to that account — see the "Retention" section below for exactly what that does and does not cover. Every `RETENTION DECISION NEEDED` marker below refers to *ongoing* retention while an account stays active (there is still no auto-expiry/scheduled-purge policy for any category), not to what happens on deletion, which is now: gone.

This document is a working input for a future privacy policy, the App Store Privacy Nutrition Label, and account-deletion design — it is not itself a privacy policy and creates no legal obligations. Nothing here has had legal review.

## How to read the tables

| Column | Meaning |
|---|---|
| Data | The specific field or data category |
| Collected? | Yes/No, and how (user-entered, server-generated, third-party-provided) |
| Linked to user? | Whether it's tied to a specific Kinwin account (`owner_id`/`auth.users.id`) |
| Purpose | Why Kinwin actually uses it, in plain terms |
| Storage/system | Where it lives — table, schema, or which Edge Function/provider |
| Third party | Any outside processor that sees this data, or "None" |
| Retention/deletion status | Current real behavior, or `RETENTION DECISION NEEDED` |

`public` schema tables are reachable by the owning user (via RLS) through the normal client. `private` schema tables are `service_role`-only — never reachable by any client, mobile or web.

## 1. Identity / account

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Email address | Yes, user-entered at signup | Yes | Login identifier, password reset delivery, GoTrue-managed email confirmation | Supabase Auth (`auth.users`), not a Kinwin-owned table | Supabase (infrastructure processor) | RETENTION DECISION NEEDED |
| Password | Yes, user-entered | Yes | Authentication | Supabase Auth — Kinwin never sees or stores the plaintext or a hash; GoTrue does | Supabase | Deleted only if the `auth.users` row is deleted — RETENTION DECISION NEEDED |
| Supabase user id (UUID) | Yes, server-generated at signup | Yes (is the identity) | Primary key for every owned row across the schema | `auth.users.id`, referenced by `owner_id`/`user_id` everywhere | Supabase | Tied to account lifetime — RETENTION DECISION NEEDED |
| Display name | Optional, user-entered | Yes | Shown to the user themself and to Kin | `public.profiles.display_name` | None | Deleted with the profile row if/when deletion is implemented |
| Kin code (8-char) | Auto-generated at signup, not user-chosen | Yes | Lets another person add this user as Kin without knowing their email | `public.profiles.kin_code` | None | Same as profile |
| "Show challenge intro" preference | Yes, user toggle | Yes | UI preference only | `public.profiles.show_challenge_intro` | None | Same as profile |
| Session tokens (access/refresh) | Yes, generated on sign-in | Yes | Keeps the user signed in | Device `AsyncStorage` (client-side only) + Supabase Auth server-side | Supabase | Cleared on sign-out; server-side lifetime governed by Supabase Auth, not Kinwin code |

## 2. Challenge data

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Goal (free text) | Yes, user-entered | Yes | The core product mechanic | `public.challenges.activation_snapshot` (and `challenge_drafts.draft_payload` pre-activation) | None | RETENTION DECISION NEEDED |
| Behavior / promise, completion definition | Yes, user-entered | Yes | Defines what counts as success | Same as above | None | RETENTION DECISION NEEDED |
| Measurement definition, rhythm/frequency, duration | Yes, user-entered | Yes | Defines the success rule | Same as above | None | RETENTION DECISION NEEDED |
| Check-in events (append-only) | Yes, user-submitted per period | Yes | Determines success/failure | `public.check_in_events` — append-only, corrections are new rows, never edited/deleted (enforced by a DB trigger, not just app logic) | None | RETENTION DECISION NEEDED |
| Challenge periods, computed status | Server-generated | Yes | Tracks progress against the rule | `public.challenge_periods` | None | RETENTION DECISION NEEDED |
| Final result (success/failure) | Server-computed | Yes | The outcome the whole product hinges on | `public.challenges.challenge_status`, `completed_at` | None | RETENTION DECISION NEEDED |
| Personal Playbook entries | Optional, user-entered | Yes | User's own private lessons-learned notes | `public.playbook_entries` | None | RETENTION DECISION NEEDED |

## 3. Social / Kin

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Kin connections (requester/recipient pairs, status) | Yes, user-initiated | Yes (both parties) | The private friend-graph the whole Kin feature is built on | `public.kin_connections` | None | RETENTION DECISION NEEDED |
| Block records (`blocked_by`) | Yes, user-initiated | Yes | Prevents further contact/re-requests | `public.kin_connections.status='blocked'` | None | RETENTION DECISION NEEDED |
| Activity events (challenge started/succeeded/failed) | Server-generated, not user-entered | Yes (the owner) | Populates the Kin activity feed | `public.social_activity` | None | RETENTION DECISION NEEDED |
| Reactions (`respect`/`nice`/`worth_it`/`ouch`/`brutal`) | Yes, user-initiated, one per user per activity item | Yes | Lightweight social response | `public.activity_reactions` | None | RETENTION DECISION NEEDED |
| Content reports (reporter, reported person, optionally a specific activity item, a fixed-category reason, an optional short detail, status) | Yes, user-initiated | Yes (both the reporter and the reported person) | Lets a user flag another person's visible activity or profile for review; reviewed manually by the founder/operator, no automated action taken on it | `private.social_reports` — `service_role`-only, never reachable by any client (mobile, web, or otherwise) | None | RETENTION DECISION NEEDED |
| Current-challenge visibility | Not stored separately — derived live from `challenges`/`kin_connections` at query time | Yes | Lets accepted Kin see what you're currently doing | Computed, not a stored table | None | N/A — not persisted independently |

Current model is binary: any accepted Kin sees all of a user's activity and current-challenge state. There is no per-post or per-Kin audience control in the shipped product (see `docs/PRODUCT_STATUS.md` §10 for the disconnected prototype that explored one).

**Content filtering, factually:** display names and the challenge text that becomes visible to Kin (behavior description, completion definition, recipient names) are checked against a small, fixed deny-list at the point they're written (`private.contains_disallowed_content`, enforced server-side, not just in the app) and rejected outright if disallowed — never silently altered. This is a narrow heuristic aimed at obvious profanity/harassment, not a real moderation system, and does not itself collect or store any additional data about the user; it only rejects or allows writes that were already going to happen.

## 4. Financial / payment

Kinwin and Stripe own different halves of this data. Kinwin **never** sees or stores raw card numbers, CVC, or full card data — that flows directly from the Stripe SDK to Stripe's own servers. Kinwin only ever stores Stripe's own opaque *references* to that data.

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Stake amount, currency | Yes, user-entered | Yes | The consequence amount | `public.consequences.stake_minor_units`/`currency` (USD only, enforced by a DB `CHECK`) | None | RETENTION DECISION NEEDED |
| Raw card number / CVC / expiry | **Never collected by Kinwin.** Entered directly into Stripe's PaymentSheet UI, transmitted TLS-direct to Stripe | N/A | N/A — Kinwin has no code path that can see this | Stripe only | Stripe | N/A |
| Stripe customer reference | Yes, Stripe-generated, stored by Kinwin | Yes | Lets Kinwin ask Stripe to charge the right customer later | `private.stripe_customers.stripe_customer_id`, `private.consequence_provider_references.customer_reference` (service-role only, never client-reachable) | Stripe | RETENTION DECISION NEEDED — needed for reconciliation/audit; see `docs/ACCOUNT_DELETION_DECISIONS.md` |
| Stripe payment-method reference | Yes, Stripe-generated | Yes | Identifies the saved card without holding its number | `private.consequence_provider_references.payment_method_reference` | Stripe | Same as above |
| SetupIntent / PaymentIntent ids | Yes, Stripe-generated | Yes | Idempotency and reconciliation with Stripe's own records | `private.consequence_setup_attempts.stripe_setup_intent_id`, `private.consequence_charge_attempts.provider_reference` | Stripe | Same as above |
| Charge state / attempt history | Server-generated | Yes | Tracks whether the consequence was actually charged, retry history | `private.consequence_charge_attempts` | None (state), Stripe (source of truth) | RETENTION DECISION NEEDED |
| Consequence/reward lifecycle status | Server-generated | Yes | Drives the whole failure→charge→reward pipeline | `public.consequences.status` | None | RETENTION DECISION NEEDED |
| Webhook event log | Server-generated (Stripe event ids) | No (event-scoped, not directly user-scoped) | Idempotent webhook processing | `private.stripe_webhook_events` | Stripe (originates the events) | RETENTION DECISION NEEDED |

## 5. Recipient / organizer

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Recipient display names | Yes, user-entered by the challenge owner | No Kinwin account required — a recipient does not need to be a Kinwin user | Identifies who benefits if the challenge fails | `public.challenge_recipients.display_name` | None | RETENTION DECISION NEEDED |
| Recipient/organizer bearer tokens | Server-generated, 43-char opaque values | Tied to the invitation, not to any account | Grants accountless access to the private invitation page | Only a SHA-256 **hash** of the token is persisted (`public.invitations.token_hash`); the raw token is never stored, only ever shown once at share time | None | Rotated (old hash invalidated) whenever regenerated; otherwise persists with the invitation |
| Acceptance / decline status | Yes, recorded on response | Tied to the invitation | Gates reward-organizer access | `public.invitations.invitation_status`, `responded_at` | None | RETENTION DECISION NEEDED |
| Organizer role assignment | Yes, chosen by the owner at creation | Tied to the challenge | Identifies who is trusted to organize the reward | `public.challenge_reward_organizers` | None | RETENTION DECISION NEEDED |
| Reward-progress state exposed to the owner | Server-computed, coarse (4 states) | Yes | Lets the owner know if the reward needs attention, without leaking provider detail | `get_owner_reward_progress` RPC output — never persisted, computed per request | None | N/A — not stored |
| Reward-link access attempts | Server-generated (timestamps, outcome, failure code only) | Tied to the invitation, not directly to a Kinwin account | Operational auditing of "Open reward" attempts | `private.reward_link_access_events` (service-role only) | None | RETENTION DECISION NEEDED |

No recipient/organizer email, phone number, or postal address is ever collected by Kinwin — only a free-text display name the owner typed in.

## 6. Tremendous (reward fulfillment)

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Organizer display name sent to Tremendous | Yes — the same free-text name from §5 | Not tied to any Tremendous-side account; Kinwin sends only a name | Required by Tremendous's API to address the reward order | Sent in the order-creation request body (`supabase/functions/_shared/tremendous/adapter.ts`); confirmed by reading the adapter source directly — only `recipient: { name: item.organizerName }` is sent, no email/phone/address | Tremendous | N/A — not a Kinwin storage decision |
| Provider order/reward id references | Yes, Tremendous-generated | Tied to the consequence | Idempotency, reconciliation, "Open reward" link generation | `private.reward_fulfillments.provider_reference` (service-role only) | Tremendous | RETENTION DECISION NEEDED |
| Reward LINK URL | Generated on demand, **transient** | Tied to the invitation at request time | The actual redeemable reward link | Confirmed directly in the fulfillment function source: generated and returned in the HTTP response, **never written to any table** | Tremendous | N/A — never persisted, cannot be "deleted" because it never exists at rest |
| Reward monetary amount, currency | Yes | Tied to the consequence | Determines the reward value | `private.reward_fulfillments.amount_minor_units`/`currency` | Tremendous | RETENTION DECISION NEEDED |

Everything sent to Tremendous is TEST/sandbox-only today (`readTremendousSandboxConfig` hard-rejects any non-`testflight.tremendous.com` base URL and non-`TEST_`-prefixed key) — no real reward has ever been fulfilled or could be with the current configuration.

## 7. Technical / operational

| Data | Collected? | Linked to user? | Purpose | Storage/system | Third party | Retention/deletion status |
|---|---|---|---|---|---|---|
| Device/app metadata (device model, OS version, app version) | **Not collected by any Kinwin code.** No analytics or telemetry SDK exists in `package.json` or anywhere in the codebase. | N/A | N/A | N/A | None | N/A |
| Check-in `source` field (`ios`/`android`/`web`/`server`/`support`) | Yes — a platform label, not a device identifier | Yes | Lets support distinguish which surface a check-in came from | `public.check_in_events.source` | None | RETENTION DECISION NEEDED |
| IP address / request logs | Not collected by Kinwin application code. Supabase's and Expo/EAS's own hosting infrastructure necessarily logs requests for operating their services (standard for any hosted API/CDN), but Kinwin has no code that reads, stores, or acts on IP addresses. | Indirectly, at the infrastructure layer only | Infrastructure operation (Supabase/EAS), not a Kinwin product feature | Supabase/EAS platform logs, outside Kinwin's own database | Supabase, Expo/EAS | Governed by Supabase's and Expo's own infrastructure retention, not Kinwin's |
| Crash analytics | **None.** No Sentry/Bugsnag/Crashlytics or equivalent in the dependency tree. | N/A | N/A | N/A | None | N/A |
| Product analytics | **None.** No analytics SDK anywhere in `package.json` or application code. | N/A | N/A | N/A | None | N/A |
| Push notification tokens | **None.** No push notification SDK integration exists. | N/A | N/A | N/A | None | N/A |
| Worker/operational logs (payment, reward, completion workers) | Yes — run counts, timing, error codes only, no user-facing content | Indirectly (references obligation/consequence ids) | Operational health monitoring | `private.consequence_payment_worker_runs`, `private.challenge_completion_worker_runs`, `private.reward_fulfillment_worker_runs`, etc. — all service-role only | None | RETENTION DECISION NEEDED |

## 8. Third-party processors / services actually in use

| Service | What it sees | Why it's used | Evidence |
|---|---|---|---|
| **Supabase** | All application data (Postgres), auth credentials/session (GoTrue), Edge Function execution | Database, authentication, serverless functions | Every table/function in `supabase/` |
| **Stripe** | Card details (never touch Kinwin), customer/payment-method/PaymentIntent references, stake amount, currency | Consequence payment authorization and charging | `app/account/payment-setup.tsx`, `supabase/functions/create-consequence-setup-intent`, `stripe-consequence-webhook`, `_shared/consequence-payment/` |
| **Tremendous** | Organizer display name, reward amount/currency, order/reward references | Reward fulfillment (gift-card-style LINK rewards) | `supabase/functions/_shared/tremendous/adapter.ts`, sandbox-only currently |
| **Expo / EAS (Hosting, Build)** | App bundle, build artifacts, the web-export static assets served at the public invitation origin | App distribution, web hosting for the accountless invitation fallback | `eas.json`, `app.config.js`, `docs/BETA_TEST_ENVIRONMENT.md` |
| **Apple** | Whatever the App Store distribution pipeline itself requires (device registration for ad-hoc builds, TestFlight once used) — not a Kinwin data-collection decision | Required for iOS distribution | `docs/IOS_BETA_BUILD.md` |

No other third-party service is integrated. There is no analytics vendor, no crash-reporting vendor, no advertising SDK, no marketing/CRM tool, and no customer-support platform.

## Retention

Almost every category above is still marked `RETENTION DECISION NEEDED` for **ongoing** retention because **no auto-expiry/scheduled-purge period has been decided for any Kinwin-owned data while an account stays active**, and none is invented here.

**On account deletion, retention is now decided and implemented** (`docs/ACCOUNT_DELETION_DECISIONS.md`, `supabase/migrations/20260903000000_account_deletion.sql`): once every challenge/payment/reward obligation on the account is genuinely terminal (never while one is still active or unresolved — deletion is never an escape hatch from a commitment), the account's own challenge content, check-ins, Playbook entries, social activity, reactions, Kin connections, recipient/organizer display names, invitations, and (for the current TEST-only beta) Stripe/Tremendous provider references are all hard-deleted, followed by the `auth.users` row itself. The one thing this does *not* solve is **production, real-money retention**: for the current TEST-beta product, every Stripe/Tremendous reference is deleted with the rest of the account, since no real money has ever moved; before real-money launch, a separate, undesigned decision (with real legal/accounting advice) is still needed on what minimal accounting/reconciliation record, if any, must survive deletion and for how long — see `docs/ACCOUNT_DELETION_DECISIONS.md`'s "Payment / provider records" section.

## App Store privacy declaration working map

**This is a working map to prepare for the real App Store Connect privacy questionnaire — it is not an App Store submission and does not replace filling out that questionnaire directly against Apple's current, exact wording at submission time.** Categories below use Apple's current published App Privacy Details taxonomy (Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, User Content, Browsing History, Identifiers, Purchases, Usage Data, Diagnostics, Surroundings, Body, Other).

| Apple category | Collected by Kinwin? | Linked to identity? | Purpose (Apple's terms) | Used for tracking? |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality (account, auth, password reset) | No |
| Contact Info → Name | Yes: account display name (optional), and separately recipient/organizer display names the challenge owner types in (see note below on the one open question for the latter) | Yes for the account holder; tied to the invitation, not a Kinwin account, for a recipient/organizer | App Functionality (personalization; identifying who a reward is for) | No |
| Contact Info → Phone Number, Physical Address | No | — | — | No |
| Contact Info → Other User Contact Info | No. Apple's own published definition of this category is broader than just email/phone/address — it covers information that can be used to contact a user outside the app generally — but a free-text display name someone types in is not, by itself, a means of contacting that person outside Kinwin; Kinwin collects no such external contact channel for a recipient or organizer, only a typed display name, which belongs under Contact Info → Name instead (see above and the note below) | — | — | No |
| Financial Info → Payment Info | See note below | — | — | No |
| Financial Info → Other Financial Info | SUBMISSION-TIME CLASSIFICATION CHECK NEEDED (see note below) | Yes, if this category ultimately applies | App Functionality | No |
| Identifiers → User ID | Yes (Supabase user id) | Yes | App Functionality | No |
| Identifiers → Device ID | No | — | — | No |
| User Content → Other User Content | Yes (goals, behaviors, check-ins, Playbook entries, reactions) | Yes | App Functionality | No |
| Usage Data → Product Interaction | SUBMISSION-TIME CLASSIFICATION CHECK NEEDED (see note below) | Yes, if this category ultimately applies | App Functionality | No |
| Usage Data → Advertising Data | No — no advertising SDK or ad-targeting code exists anywhere in the codebase | — | — | No |
| Diagnostics (Crash Data, Performance Data) | No — no crash-reporting SDK exists | — | — | No |
| Location (Precise/Coarse) | No | — | — | No |
| Health & Fitness | No — challenge goals are free text, never read through HealthKit or any fitness-specific API | — | — | No |
| Sensitive Info | Not solicited or categorized as such; a user's free-text goal could theoretically contain sensitive detail voluntarily, same as any free-text field | — | — | No |
| Contacts (device address book) | No — Kin connections use in-app search/Kin code, never device contact-list import | — | — | No |
| Purchases | No — no in-app purchase exists | — | — | No |
| Browsing/Search History | No | — | — | No |
| Surroundings, Body | No — no camera/AR/body-scanning feature | — | — | No |

**Tracking, overall:** none. No advertising SDK, no data broker relationship, no cross-app/cross-site data sharing exists anywhere in the codebase. Every third party in §8 above (Supabase, Stripe, Tremendous, Expo/EAS) processes data solely to provide Kinwin's own app functionality, not for their own or a third party's advertising/tracking purposes — this is the standard "service provider," not "tracking," relationship under Apple's definition, but that classification should still be confirmed against Stripe's and Tremendous's own current data-processing agreements before submission, not assumed here.

**Items marked "see note" or "SUBMISSION-TIME CLASSIFICATION CHECK NEEDED" — genuine open questions, not resolved here:**
1. **Recipient/organizer display names, and why they belong under "Name," not "Other User Contact Info."** Apple's own published definition of "Other User Contact Info" is broader than just another person's email, phone number, or physical address — it is described generally as information that can be used to contact a user outside the app, with those three as examples, not an exhaustive list. A free-text display name someone types in is not, on its own, a channel for contacting that person outside Kinwin (Kinwin never collects an email, phone number, or physical address for a recipient or organizer), so it is squarely the "Name" category by Apple's own examples, not "Other User Contact Info." The one genuine open question is narrower than the earlier draft of this document treated it: whether a name belonging to someone who is not the app's account holder still counts the same way for questionnaire purposes, or needs a separate note at submission. That narrow point, not the category choice itself, is what should be checked against Apple's exact current questionnaire wording at submission time.
2. **"Other Financial Info" for the stake amount.** Apple's own published examples for this category are things like salary, income, assets, liabilities/debts, and credit score; a user's self-selected consequence stake amount is not obviously the same kind of fact, and forcing a confident "Yes" risks over-declaring. This needs a real decision against Apple's current exact category description at submission time rather than an engineering guess either way, so it is marked as a submission-time check rather than asserted.
3. **"Product Interaction" usage data.** The earlier reasoning here ("No, because no analytics SDK exists") was invalid: Apple's Usage Data category is defined by what interaction data is actually collected, not by whether a dedicated analytics SDK is present. Kinwin does collect check-in events, reactions, activity events, and a check-in `source` platform field (see §2, §3, §7 above); the honest position is that these are already declared once, as User Content, and it is a genuine open question whether any of them (particularly the `source` field, which is closer to "how you interact with the app" than to user-authored content) should *also* be declared under Usage Data → Product Interaction. This needs checking against Apple's exact current wording at submission time rather than a confident No or Yes here. Advertising Data, by contrast, can be stated confidently as No: there is no advertising SDK or ad-targeting code anywhere in the codebase.
4. **"Payment Info"**: Kinwin's own servers never receive raw card data (Stripe's PaymentSheet SDK collects it directly and it never transits Kinwin's own code or database — see §4 above). Apple's current App Privacy Details guidance has specific, narrower treatment for apps using a third-party payment processor SDK where the developer never receives the payment data, but the exact current wording and whether it fully exempts this from declaration needs to be checked directly in the App Store Connect questionnaire at submission time — not assumed from this document.

## Source-of-truth note

This inventory reflects the schema and code as of main `75268fd` plus the account-deletion package. Like `docs/PRODUCT_STATUS.md`, it should be updated in the same PR whenever a future change adds, removes, or changes what data Kinwin collects or sends to a third party.
