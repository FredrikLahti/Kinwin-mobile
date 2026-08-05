# Consequence payment setup (Stripe test mode)

Trusted, backend-only foundation for saving a consequence payment method with Stripe,
in test mode, for a future off-session charge. See
`docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 8, `docs/SUPABASE_SCHEMA.md`'s "Trusted
RPCs" section, and `docs/PRODUCT_DECISIONS.md`'s "Consequence payment setup (Stripe
test mode)" section for the product rules and database design this implements. This
document covers the flow itself and how to run/test it locally.

## What this package does and does not do

**Does:** create or reuse a Stripe Customer per owner; create a SetupIntent (cards
only, for future `off_session` use); verify Stripe's webhook signature and process
events idempotently; atomically authorize `public.consequences` once a SetupIntent
genuinely succeeds; preserve an already-authorized method while a replacement attempt
is in progress.

**Does not:** implement React Native PaymentSheet or any visible consent screen (see
the consent-contract data list in `docs/PRODUCT_DECISIONS.md` — that is what a future
client package must show, not something this package renders); touch memberships;
charge anything; activate a challenge; touch check-ins or Tremendous fulfillment.
`challenge_status` never leaves `pending_activation` because of anything in this
package, and `consequences.status` only ever reaches the pre-activation `authorized`
state, never `active`.

## Architecture

```
Client (future)                Edge Functions                    Database
────────────────               ─────────────────────────────     ──────────────────────
                                create-consequence-setup-intent
POST { challengeId } ─────────▶  requires a real Supabase JWT
                                  caller derived from the JWT,
                                  never the request body
                                  │
                                  ├─▶ public.prepare_consequence_setup   (validate + read)
                                  │
                                  ├─▶ Stripe: create/reuse Customer,     (real Stripe API,
                                  │   create/retrieve SetupIntent         idempotency keys)
                                  │
                                  └─▶ public.record_consequence_setup_attempt (atomic write)
◀───────────── { clientSecret } ─┘

                                stripe-consequence-webhook
Stripe ──── signed event ─────▶  verify_jwt disabled; Stripe's own
                                  HMAC signature is the real boundary
                                  │
                                  ├─▶ verify signature (before anything
                                  │   else is trusted)
                                  ├─▶ Stripe: retrieve the canonical
                                  │   SetupIntent by id
                                  └─▶ public.apply_consequence_setup_event  (atomic write)
```

Both Edge Functions are thin: the actual decisions (which Stripe calls to make, with
which idempotency keys and metadata; how to map a webhook event to RPC arguments) live
in `supabase/functions/_shared/consequence-setup/*.ts` — plain TypeScript with no Deno
dependency, unit tested with `node --test` against an in-memory `FakeStripeAdapter`
(`supabase/functions/_shared/consequence-setup/fake-stripe-adapter.ts`). This lives
inside `supabase/functions/` (not `domain/`, despite being plain, Deno-independent
TypeScript) because the Supabase CLI's Edge Runtime — both `supabase start` locally and
real deployment — only bundles files reachable from within `supabase/functions/`; a
relative import reaching outside that tree fails at serve time even though `deno check`
alone doesn't catch it (found out the hard way — see git history). `tsconfig.test.json`
still compiles and runs its tests with plain `node --test`, independent of Deno. The
Edge Function entrypoints (`supabase/functions/create-consequence-setup-intent/index.ts`,
`supabase/functions/stripe-consequence-webhook/index.ts`) only wire real Supabase/Stripe
clients into that same logic.

All database lifecycle transitions happen inside three trusted, `service_role`-only
RPCs (`public.prepare_consequence_setup`, `public.record_consequence_setup_attempt`,
`public.apply_consequence_setup_event` — see
`supabase/migrations/20260810000000_consequence_setup_stripe.sql`), never as several
separate statements run directly from the Edge Function.

## Local setup

1. Get Stripe **test mode** API keys from <https://dashboard.stripe.com/test/apikeys>
   (secret key, `sk_test_...`) and a webhook signing secret from either
   <https://dashboard.stripe.com/test/webhooks> (if forwarding to a public URL) or the
   Stripe CLI's `stripe listen` command (prints its own `whsec_...` for local
   forwarding — see below).
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill in
   `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SIGNING_SECRET`. This file is gitignored
   (the repository root `.gitignore`'s `.env`/`.env.*` patterns cover it) and is loaded
   automatically by `supabase start`.
3. `supabase start` — the local Edge Runtime serves both functions at
   `http://127.0.0.1:54321/functions/v1/create-consequence-setup-intent` and
   `.../stripe-consequence-webhook`.
4. To forward real Stripe test-mode webhook events to the local function, install the
   [Stripe CLI](https://docs.stripe.com/stripe-cli) and run:
   ```
   stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-consequence-webhook
   ```
   Use the `whsec_...` it prints as `STRIPE_WEBHOOK_SIGNING_SECRET` (restart
   `supabase start` after changing `supabase/functions/.env`).
5. Call `create-consequence-setup-intent` with a real Supabase session's access token
   as the `Authorization: Bearer` header and a JSON body of `{ "challengeId": "..." }`
   (or `{ "consequenceId": "..." }`) for an owner's own `pending_activation` challenge.

## Never commit

Real Stripe secret keys, webhook signing secrets, `supabase/functions/.env` itself,
Supabase service-role keys, or test card numbers/tokens belong nowhere in this
repository — only placeholders in `.env.example` files. If either Stripe secret is
missing at runtime, both functions return a `server_configuration_error` (HTTP 500)
without naming which variable is missing or revealing any part of its value.

## Testing

- **PostgreSQL assertions** (`supabase/tests/140_consequence_setup_stripe.sql`, run via
  `supabase/tests/run.sh`): every trusted-RPC guarantee, directly against real
  PostgreSQL, no Stripe or Deno involved.
- **Unit tests** (`supabase/functions/_shared/consequence-setup/*.test.ts`, run via `npm test`): the Stripe
  orchestration and webhook-event-mapping logic, against `FakeStripeAdapter` —
  deterministic, no network access.
- **Edge Function integration tests**
  (`supabase/tests/e2e/consequence-setup-stripe.e2e.ts`, run via `npm run test:e2e`
  against a real `supabase start` stack — CI only, see
  `.github/workflows/supabase-e2e.yml`): real JWT verification, real ownership/status
  rejection over HTTP, and real Stripe webhook signature verification (a valid
  signature is constructed locally with Node's built-in `crypto`, reproducing Stripe's
  own v1 HMAC scheme — no real Stripe account needed for this). CI provides
  `supabase/functions/.env` with clearly-fake placeholder secrets, so a request that
  would need a genuine Stripe API call to fully succeed is asserted to fail with
  exactly `502 payment_provider_error` — proof the auth/ownership/RPC layer already
  did its job and only the placeholder Stripe key failed, never proof of a bug in this
  system's own logic.
- **Optional real Stripe test-mode smoke test**: the same e2e file's last test block
  runs only when `STRIPE_LIVE_TEST_SECRET_KEY` and
  `STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET` are already set in the environment to real
  Stripe test-mode secrets — never requested, printed, or invented by the suite or by
  Claude. When present, it creates a real SetupIntent, confirms it with Stripe's own
  `pm_card_visa` test payment method, delivers a genuinely signed event, and asserts
  the consequence is actually authorized. **This did not run as part of building this
  package** — no such secrets exist in this repository or its CI — so the real
  Stripe-integration round trip remains unverified beyond the deterministic tests
  above; a maintainer with a Stripe test account can run it locally by exporting both
  variables before `npm run test:e2e` against a `supabase start` stack whose
  `supabase/functions/.env` uses the same real test keys.
