# Hosted beta TEST environment

## Scope and target

This is the authoritative release contract for Supabase project
`ywoledppusxwdonwsewh`. It is **TEST ONLY**. Never link these commands, secrets, Stripe
objects, or Tremendous orders to production. Repository migrations and function source are
authoritative when older documents differ.

The expected pre-lineage repository baseline is `20260824000000_personal_playbook.sql`.
Because this repository cannot inspect the hosted migration ledger without authentication, an
operator must confirm that boundary with the linked CLI before applying anything. Apply only
missing forward migrations; never reset, repair blindly, squash, or replay an applied migration.

## Configuration inventory

### A. Expo public configuration

| Name | Reader | Required | Format and validation |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `lib/supabase/config.ts` | Yes | Exactly `https://ywoledppusxwdonwsewh.supabase.co` for this beta. Public. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/config.ts` | Yes | Public anon key for the TEST project. Never substitute a service-role or secret key. |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `lib/stripe/config.ts` | Yes for payment setup | Stripe test publishable key beginning `pk_test_`. Never `pk_live_`. |
| `EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL` | Home challenge/result sharing | Yes for sharing | Public HTTPS origin serving the Expo Router app. No trailing `/invite`, token, query, or fragment. The runtime app appends `/invite/{token}`. The beta hostname remains an external release value; no hostname is guessed here. |

### B, D. Edge Function and Stripe TEST secrets

| Name | Reader | Required | Format and validation |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | setup-intent, failed-consequence worker, Stripe webhook | Yes | Server-only `sk_test_...`. Reject any live key during release review. |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | `stripe-consequence-webhook` | Yes | Server-only `whsec_...` for the TEST endpoint. Verify with a signed TEST event. |

Supabase injects its own function runtime URL and admin credentials. They are platform-managed,
not Expo configuration and must not be copied into repository environment files.

### C. Worker authentication and Vault

| Name | Location | Required | Format and validation |
| --- | --- | --- | --- |
| named secret key `default` | Supabase function secret-key configuration | Yes | A hosted `sb_secret_...` key accepted by `auth: 'secret:default'`. Server-only. |
| `kinwin_project_url` | Supabase Vault | Yes | `https://ywoledppusxwdonwsewh.supabase.co`. |
| `kinwin_cron_secret_key` | Supabase Vault | Yes | Same named `default` secret API key. Never an anon key or user JWT. |

`kinwin_cron_service_role_key` appears only in the superseded historical migration and is removed
by `20260822000000_fix_scheduled_completion_secret_auth.sql`; it is not current configuration.

### E. Tremendous Testflight secrets

| Name | Reader | Required | Format and validation |
| --- | --- | --- | --- |
| `TREMENDOUS_API_BASE_URL` | Tremendous adapter | Yes for rewards | Exactly `https://testflight.tremendous.com`. Production origin is rejected. |
| `TREMENDOUS_API_KEY` | Tremendous adapter | Yes for rewards | Server-only key beginning `TEST_`. |
| `TREMENDOUS_FUNDING_SOURCE_ID` | order creation | Yes for rewards | Nonempty Testflight funding source ID. |
| `TREMENDOUS_CAMPAIGN_ID` | order creation | Yes for rewards | Nonempty Testflight LINK campaign ID. |

The optional smoke command additionally requires `KINWIN_ALLOW_TESTFLIGHT_ORDER`,
`TREMENDOUS_SMOKE_EXTERNAL_ID`, and `TREMENDOUS_SMOKE_AMOUNT_MINOR_UNITS`. These are operator
safety inputs, not deployed application secrets.

`BETA_TEST_USER_ACCESS_TOKEN` is an optional, short-lived TEST-user token used only by the
read-only hosted verifier to prove the owner reward RPC is deployed. It is never an app setting,
must not be committed, and may be omitted; the linked migration ledger then supplies that proof.

## Forward migration manifest

After confirming the hosted ledger ends at `20260824000000_personal_playbook.sql`, apply in this
exact order:

1. `20260825000000_recipient_invitation_access.sql`: hashed scoped invitation access; depends on existing challenges and recipients.
2. `20260826000000_canonical_reward_organizer.sql`: immutable organizer identity and organizer invitation binding; depends on 25.
3. `20260827000000_tremendous_sandbox_fulfillment.sql`: private reward obligations, leases, claims, and results; depends on canonical organizer targets.
4. `20260828000000_reward_fulfillment_reconciliation.sql`: separates provider creation from readiness; depends on 27.
5. `20260829000000_tremendous_link_delivery_contract.sql`: enforces LINK `SUCCEEDED`, removes durable reward URLs, and adds transient organizer lookup; depends on 28.
6. `20260830000000_reward_fulfillment_operations.sql`: stale-work recovery, access audit, service-only health view, and reward schedules; depends on 29 and deployed scheduled functions.
7. `20260831000000_owner_reward_progress.sql`: owner-safe product status projection; depends on fulfillment and organizer tables.

Deploy all Edge Function code and configure secrets before migration 30 can wake reward workers.
After applying, compare the linked migration ledger again and run `npm run verify:hosted-beta`.

## Edge Function deployment manifest

`verify_jwt` below is the gateway setting in `supabase/config.toml`. `user` and `secret` are the
additional `@supabase/server` authorization boundary inside the function.

| Domain | Function | Boundary | Secrets | Scheduled / responsibility |
| --- | --- | --- | --- | --- |
| Challenge | `append-check-in-event` | JWT on, authenticated user | none | No; validates and appends a check-in. |
| Challenge | `finalize-challenge` | JWT on, authenticated owner | none | No; opportunistic completion fast path. |
| Payment | `create-consequence-setup-intent` | JWT on, authenticated owner | Stripe secret | No; creates/reuses TEST SetupIntent. |
| Payment | `stripe-consequence-webhook` | JWT off, verified Stripe signature | Stripe secret + webhook secret | Stripe callback; persists verified setup/charge truth. |
| Access | `create-recipient-invitation` | JWT on, authenticated owner | none | No; rotates/creates recipient access. |
| Access | `create-organizer-invitation` | JWT on, authenticated owner | none | No; rotates/creates separate organizer access. |
| Access | `mark-recipient-invitation-shared` | JWT on, authenticated owner | none | No; records truthful share action. |
| Access | `recipient-invitation` | JWT off, scoped bearer token | none | Public-token-facing resolve/accept/decline projection. |
| Reward | `organizer-reward-link` | JWT off, accepted organizer bearer token | Tremendous secrets | Explicit transient `generate_link`; never stores link. |
| Worker | `scheduled-finalize-challenges` | JWT off, named `default` secret | worker secret | Yes; eventual challenge completion. |
| Worker | `scheduled-charge-failed-consequences` | JWT off, named `default` secret | worker + Stripe secret | Yes; TEST consequence charging. |
| Worker | `scheduled-fulfill-rewards` | JWT off, named `default` secret | worker + Tremendous secrets | Yes; one Testflight LINK order. |
| Worker | `scheduled-reconcile-rewards` | JWT off, named `default` secret | worker + Tremendous secrets | Yes; polls LINK readiness. |

## Scheduler manifest

| Job | Schedule | Function | Concurrency and missed runs |
| --- | --- | --- | --- |
| `kinwin-challenge-completion` | `*/15 * * * *` | `scheduled-finalize-challenges` | Challenge worker lease and row claims; a later run discovers all still-due challenges. |
| `kinwin-consequence-payments` | `17 * * * *` | `scheduled-charge-failed-consequences` | Payment lease and stable PaymentIntent identity; a later run resumes eligible obligations. |
| `kinwin-reward-fulfillment` | `7,37 * * * *` | `scheduled-fulfill-rewards` | Shared reward lease, unique consequence obligation, stable `external_id`; missed runs do not change eligibility. |
| `kinwin-reward-reconciliation` | `5,20,35,50 * * * *` | `scheduled-reconcile-rewards` | Shared reward lease and atomic claims; later runs poll all due provider rewards. |

Cron uses `pg_net`, `kinwin_project_url`, and `kinwin_cron_secret_key`. It only wakes workers;
database predicates and provider evidence determine truth. Confirm one row per named job, inspect
`cron.job_run_details`, and inspect private worker run tables after deployment.

## Safe post-deploy verification

`npm run verify:hosted-beta` is read-only and fixed to the TEST project. It checks GoTrue,
anonymous table denial, private-schema isolation, invalid bearer behavior, owner-RPC denial to
anon, user-function auth, worker-secret auth, and unsigned Stripe webhook rejection. It never
creates users, challenges, charges, rewards, or links and never prints credentials.

The linked Supabase CLI remains authoritative for migration and cron presence because those
objects are intentionally unavailable through PostgREST. Confirm the 25 through 31 ledger,
required function list, four named cron rows, Vault secret names, and recent run history without
printing decrypted Vault values.

## Explicit Tremendous Testflight smoke

`npm run verify:tremendous:testflight` reuses the production adapter. It refuses production URL,
non-`TEST_` key, missing Testflight configuration, missing stable smoke `external_id`, invalid
amount, or missing exact opt-in flag. It creates one TEST reward, repeats creation to prove
idempotency, retrieves status, and generates a link only when ready. It prints safe provider IDs
and normalized status, never the reward link. The external ID must be retained for repeat runs.

## Stripe TEST safety

Only `pk_test_` and `sk_test_` credentials are permitted. Register the TEST webhook endpoint at
`/functions/v1/stripe-consequence-webhook` with its matching `whsec_` secret. Smoke payment setup
with a Stripe TEST card, verify the signed webhook changes authorization, then use the canonical
beta scenario below. Never manually mark a charge succeeded, use a live PaymentIntent, or point
the TEST project at a production webhook. Challenge failure, Stripe success, and reward readiness
remain independent server truths.

## Pre-beta security gate

- Expo contains only Supabase URL/anon key, Stripe publishable key, and invitation origin.
- No service-role, worker, Stripe secret, Tremendous key, raw invitation token, or reward LINK is committed, logged, or stored in Expo.
- `public.invitations` stores only SHA-256 token hashes; reward links are transient.
- Owner and recipient projections contain no provider IDs or private errors.
- `private.reward_fulfillment_health` and reward audit remain service-role only.
- Reward generation requires the accepted canonical organizer and verified ready fulfillment.
- Owner, ordinary recipient, wrong token, declined token, and rotated token cannot generate a link.
- RLS tests pass and `private` is absent from PostgREST exposed schemas.
- Run unit, type, lint, SQL/RLS, Deno, and real local Supabase E2E checks before release.

## Canonical beta smoke scenario

Use disposable TEST identities and ordinary product paths. Do not add a backdoor to force state.

1. Sign in a TEST owner, prepare a challenge, add one or more recipients, and choose the canonical organizer.
2. Complete Stripe TEST payment-method setup and verify the signed webhook before activation.
3. Activate, share scoped access, and have the organizer accept. Confirm recipient response never gates activation.
4. Reach a genuine failure through the configured short TEST challenge/reporting windows. There is no hosted force-failure API; local SQL fixtures are only for automated local tests.
5. Observe the scheduled TEST Stripe charge and its verified success without editing payment rows.
6. Observe one fulfillment, one Testflight order, and repeated `external_id` idempotency.
7. Observe reconciliation reach LINK `SUCCEEDED`; owner Home/result must say Reward ready.
8. Organizer sees and explicitly presses Open reward. Validate HTTPS without storing or reporting the URL.
9. Confirm an ordinary recipient and the owner cannot call organizer reward access.

Steps 4 through 8 depend on real elapsed TEST state, configured schedulers, signed Stripe TEST
events, and Tremendous Testflight credentials. The release verifier deliberately does not automate
these mutations.

## Physical iPhone beta checklist

The complete managed Expo build contract, deep-link requirements, and device sequence live in
[`IOS_BETA_BUILD.md`](./IOS_BETA_BUILD.md).

- Long organizer and recipient names; three and four recipients; smallest supported screen.
- Dynamic Type and VoiceOver reading/action order.
- Native Share access again sheet after acceptance.
- Rapid double tap on Open reward and the calm cooldown message.
- Return from the external reward link.
- Offline Open reward and retry; Wi-Fi/cellular switch during the request.

## Release evidence

Record commit SHA, linked migration list, deployed function list, cron rows, safe verifier summary,
CI URL, Stripe TEST event IDs, safe Tremendous order/reward IDs and status, and iPhone checklist
results. Never record decrypted secrets or reward URLs.
