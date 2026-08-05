# Consequence payment setup (Stripe test mode)

Trusted end-to-end flow for saving a consequence payment method with Stripe, in test
mode, for a future off-session charge: a server-side foundation (two Edge Functions and
three trusted RPCs) plus the client consent screen and native PaymentSheet integration
that use it. See `docs/BACKEND_IMPLEMENTATION_PLAN.md` phase 8, `docs/SUPABASE_SCHEMA.md`'s
"Trusted RPCs" section, and `docs/PRODUCT_DECISIONS.md`'s "Consequence payment setup (Stripe
test mode)" section for the product rules and database design this implements. This
document covers the flow itself and how to run/test it locally.

## What this package does and does not do

**Does:** create or reuse a Stripe Customer per owner; create a SetupIntent (cards
only, for future `off_session` use); verify Stripe's webhook signature and process
events idempotently; atomically authorize `public.consequences` once a SetupIntent
genuinely succeeds; preserve an already-authorized method while a replacement attempt
is in progress; show the owner a visible consent screen before opening Stripe's native
PaymentSheet; treat a successful PaymentSheet result as pending, not authorized, until
the server-owned state (driven only by the verified webhook) confirms it.

**Does not:** touch memberships; charge anything (no PaymentIntent exists anywhere in
this flow); activate a challenge; touch check-ins or Tremendous fulfillment; offer
Apple Pay, Google Pay, or any payment method beyond cards. `challenge_status` never
leaves `pending_activation` because of anything in this package, and
`consequences.status` only ever reaches the pre-activation `authorized` state, never
`active`.

## Architecture

```
Client (app/account/            Edge Functions                    Database
payment-setup.tsx)
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
        │
        ▼
  native PaymentSheet
  (@stripe/stripe-react-native,
  cards only) — a successful
  result here only moves the
  screen to "verifying"; it is
  never itself authorization
        │
        ▼
  polls fetchPendingCommitment
  (challenges/consequences
  RLS-scoped select) until the
  webhook below has authorized

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
inside `supabase/functions/_shared/` (Supabase's own documented convention for code
shared across functions), not `domain/`, and every relative import there — including
between these files themselves — uses an explicit `.ts` extension. That's not optional
style: the Supabase Edge Runtime's own module resolution (both `supabase start` locally
and real deployment) requires it and does not tolerate an extensionless import the way
Node or a raw `deno check` with sloppy-imports would (found out the hard way — see git
history). To keep the exact same files runnable with plain `node --test`,
`tsconfig.test.json` sets `allowImportingTsExtensions` and
`rewriteRelativeImportExtensions`, which rewrite each `.ts` import to `.js` in the
compiled output — the source files never need two different versions. The Edge
Function entrypoints (`supabase/functions/create-consequence-setup-intent/index.ts`,
`supabase/functions/stripe-consequence-webhook/index.ts`) only wire real Supabase/Stripe
clients into that same logic.

All database lifecycle transitions happen inside three trusted, `service_role`-only
RPCs (`public.prepare_consequence_setup`, `public.record_consequence_setup_attempt`,
`public.apply_consequence_setup_event` — see
`supabase/migrations/20260810000000_consequence_setup_stripe.sql`), never as several
separate statements run directly from the Edge Function.

## Client (PaymentSheet)

**Setup and configuration.** `@stripe/stripe-react-native` (the Expo SDK 54-compatible
version, installed via `npx expo install`) is initialized once, at the app root
(`app/_layout.tsx`), through `StripeProvider` — the smallest integration Stripe
supports, no manual `initStripe` call needed. It reads
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (see the root `.env.example`; get a test-mode key,
`pk_test_...`, from <https://dashboard.stripe.com/test/apikeys>) via
`lib/stripe/config.ts`'s `readStripeConfig()`, mirroring `lib/supabase/config.ts`'s
existing pattern for the Supabase URL/anon key. A missing key never crashes the app —
`StripeProvider` only calls native init when a key is present, and
`lib/stripe/payment-setup-availability.ts`'s `derivePaymentSetupAvailability` makes
`app/account/payment-setup.tsx` report itself as unavailable instead of attempting to
open PaymentSheet.

**Web never touches the native module.** `@stripe/stripe-react-native` has no web
build, and its native module spec calls `TurboModuleRegistry.getEnforcing('StripeSdk')`
at import time — which throws immediately outside a real native runtime. So app code
never imports that package directly; it imports `@/lib/stripe/native-stripe`, which
Metro resolves to `native-stripe.tsx` (a thin re-export of the real package) on
iOS/Android and to `native-stripe.web.tsx` (a same-shaped stub that never imports the
real package, and whose calls all resolve to an honest "native required" outcome) on
web — the standard React Native platform-extension convention. This is what lets
`app/account/payment-setup.tsx`'s consent and status screens still render on Expo Web
for visual review without ever risking a crash or a fake payment form.

**Native redirect handling.** `StripeProvider` is configured with `urlScheme="kinwin"`
(the app's existing `app.json` scheme), and `initPaymentSheet` is called with a
`returnURL` built from `expo-linking`'s `Linking.createURL('account/payment-setup')`.
The screen also registers a `Linking.addEventListener('url', ...)` that calls Stripe's
`handleURLCallback(url)` for any authentication/redirect return flow the card step
might need (e.g. a 3D Secure challenge that leaves the app) — a no-op on web, where
`useStripe()` resolves to the `native-stripe.web.tsx` stub.

**Consent and server-authority flow.** Before enabling the PaymentSheet button, the
consent screen shows the locked commitment's server-derived stake, currency, category,
recipient/organizer summary, and success rule, plus the disclosures listed in
`docs/PRODUCT_DECISIONS.md`'s "Consequence payment setup" section, gated behind an
explicit acknowledgement checkbox. A successful `presentPaymentSheet()` result is
**never** treated as authorization: the screen enters a `verifying` state and polls
`fetchPendingCommitment` (`lib/stripe/poll-authorization.ts`'s `pollForAuthorization`,
a handful of short attempts over ~15-20s) until the server-owned
`consequences.authorization_status` — set only by the verified webhook — reports
`authorized`, or the schedule times out (a calm "still verifying" state with a manual
"Check again" action). Cancel and failure outcomes
(`lib/stripe/payment-sheet-outcome.ts`) are told apart explicitly: a cancel returns to
consent with no error and no state change; a failure shows a retryable message without
touching the commitment. `authorization_status`/`authorized_at` are exposed from
`lib/supabase/challenge-repository.ts`'s `fetchPendingCommitment` (already-granted
columns under the existing `consequences_select_own` RLS policy — no new grant), so
reopening the screen after a restart, a new login, or a delayed webhook always
re-derives the true state from the server rather than trusting anything cached
locally. `app/account/pending-commitment.tsx`'s "Continue setup"/"Payment method"
button and its "CURRENT STATUS" row read the same fields.

**Cancellation.** PaymentSheet is a native modal that blocks the screen underneath
while it is presented, and it lives on its own route
(`app/account/payment-setup.tsx`) separate from the pending-commitment screen's cancel
button — so commitment cancellation is structurally unreachable while the sheet is
actively up, with no extra flag needed to enforce it.

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
6. For the client: copy the root `.env.example` to `.env` and fill in
   `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` with the **test-mode** publishable key
   (`pk_test_...`) from the same Stripe dashboard page as step 1, alongside the
   existing `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`. Run the app
   (`npx expo start`) on a real device or simulator — PaymentSheet is native-only — and
   open a pending commitment's "Continue setup" from the account screen.

## Never commit

Real Stripe secret keys, webhook signing secrets, `supabase/functions/.env` itself,
Supabase service-role keys, or test card numbers/tokens belong nowhere in this
repository — only placeholders in `.env.example` files. If either Stripe secret is
missing at runtime, both functions return a `server_configuration_error` (HTTP 500)
without naming which variable is missing or revealing any part of its value. The
client's `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not secret (it authorizes nothing by
itself, same as the Supabase anon key) but still belongs only in a gitignored `.env`,
never committed — only a placeholder lives in `.env.example`.

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
  the consequence is actually authorized. This proves the server side of the round trip
  only — it never opens PaymentSheet, so it is not a substitute for the manual native
  test below.
- **Client unit tests** (run via `npm test`, plain `node --test`, no React Native
  runtime needed — each file below is dependency-free of `lib/supabase/client.ts` and
  `@stripe/stripe-react-native` specifically so it can run this way):
  - `lib/supabase/consequence-setup-errors.test.ts` — mapping
    `create-consequence-setup-intent`'s HTTP/error-code responses to the client's own
    error states (not found, invalid state, unauthorized, server misconfiguration,
    provider failure, network failure, unknown).
  - `lib/stripe/payment-sheet-outcome.test.ts` — PaymentSheet cancel vs. failure vs.
    completion classification.
  - `lib/stripe/poll-authorization.test.ts` — the bounded verification poll: stops on
    authorized, stops on timeout, makes zero calls when already aborted, and stops
    mid-schedule when aborted (unmount/losing focus).
  - `lib/stripe/payment-setup-availability.test.ts` — the missing-publishable-key and
    web-vs-native gating that keeps PaymentSheet from ever being invoked where it
    can't run.
- **Manual real Stripe test-mode round trip (client)**: the one-time, non-automatable
  proof that a real device, the real consent screen, real PaymentSheet, and the real
  webhook all agree — see the next section.

## Manual real Stripe test-mode round trip

This is a real native device test, not something CI or an agent's own tool calls can
perform — PaymentSheet only exists once the app is actually running on a phone,
simulator, or emulator with a Stripe test-mode publishable key configured.

**Prerequisites (check presence only — never paste actual secret values into chat):**

1. `supabase/functions/.env` exists and sets non-empty `STRIPE_SECRET_KEY` (starts
   with `sk_test_`) and `STRIPE_WEBHOOK_SIGNING_SECRET` (starts with `whsec_`) — see
   "Local setup" steps 1-2 above.
2. The root `.env` exists and sets a non-empty `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   (starts with `pk_test_`) — see "Local setup" step 6 above.
3. Both files are gitignored (`git check-ignore supabase/functions/.env .env` should
   print both paths back).
4. `supabase start` is running locally, and the Stripe CLI's `stripe listen --forward-to
   http://127.0.0.1:54321/functions/v1/stripe-consequence-webhook` is forwarding real
   test-mode webhook events to it (its printed `whsec_...` must match
   `STRIPE_WEBHOOK_SIGNING_SECRET` — restart `supabase start` if you change it).

**Steps, on a real device or simulator running the app against that stack:**

1. Sign in, complete onboarding through to a locked pending commitment (or reuse an
   existing one from `/account/pending-commitment`).
2. Open "Continue setup" → confirm the consent screen shows the correct stake,
   currency, category, recipient/organizer, and success rule, and that Continue stays
   disabled until the acknowledgement is checked.
3. Continue → PaymentSheet opens → enter Stripe's test Visa card
   (`4242 4242 4242 4242`, any future expiry, any CVC, any postal code) → confirm.
4. Confirm the screen shows "verifying", then transitions to "ready" once the webhook
   (forwarded by `stripe listen`) arrives — normally within a few seconds, well inside
   the bounded poll window.
5. Force-quit and reopen the app, and separately sign out and back in; confirm the
   payment method still shows "ready" both times (server-derived, not a local flag).
6. Confirm in the Stripe dashboard's test-mode logs that only a SetupIntent exists for
   this attempt — no PaymentIntent, no charge — and confirm in the database (or via the
   app) that the underlying challenge is still `pending_activation`, not activated.
7. Optionally, also exercise: dismissing PaymentSheet without entering a card (expect a
   calm return to consent, no error, commitment untouched); one retryable failure, e.g.
   Stripe's decline test card `4000 0000 0000 0002` (expect a retryable error message,
   commitment and any prior authorization untouched); and "Change payment method" from
   the ready state (expect the previously authorized method to keep showing as ready
   until the new attempt's webhook actually confirms the replacement).

## Verification status as of this client package

Typecheck, lint, the full unit test suite (including the new client tests above), and
`supabase/tests/run.sh`'s PostgreSQL assertions all pass. `npx expo-doctor` passes
every check that does not require reaching Expo's own remote servers. Neither
`supabase/functions/.env` nor a root `.env` exist in this repository or its CI, so
prerequisite 1 and 2 above are not met here — the local Supabase E2E suite
(`npm run test:e2e`) and the manual real Stripe test-mode round trip both remain
un-run in this environment; see the git history/PR description for whether a
maintainer has since completed them. No charge, PaymentIntent, or challenge activation
exists anywhere in this flow regardless.
