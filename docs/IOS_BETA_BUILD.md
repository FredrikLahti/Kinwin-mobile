# iOS hosted TEST beta

This contract covers the managed Expo SDK 54 iOS build against Supabase TEST project
`ywoledppusxwdonwsewh`. It does not authorize production configuration, App Store submission,
or production Stripe or Tremendous use. Backend deployment remains governed by
`BETA_TEST_ENVIRONMENT.md`.

## Build identity and profile

- App name: Kinwin
- Expo slug: `kinwin-mobile`
- Version: `1.0.0`
- iOS beta bundle identifier: `com.kinwin.mobile.beta`
- Custom scheme: `kinwin`
- Initial local build number: `1`; EAS `beta` uses `autoIncrement`
- EAS profile: `beta`, internal distribution, real-device iOS build, EAS environment `preview`

The beta identifier is intentionally not declared to be the final App Store identifier. Confirm
the production identifier before any production signing or listing. No Apple Team ID, EAS project
ID, certificate, provisioning profile, or App Store Connect ID is stored in the repository.

## Build configuration gate

The beta profile sets only `KINWIN_VALIDATE_BETA=1` in `eas.json`. The four public values are
provided through the EAS `preview` environment:

- `EXPO_PUBLIC_SUPABASE_URL`: exactly the hosted TEST project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: TEST anon/publishable key, never a secret/service key
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`: must begin `pk_test_`
- `EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL`: HTTPS origin only

`app.config.js` refuses the beta build when these are absent or invalid, when the Supabase project
is different, when Stripe is live, when the invitation value contains a path/token/query, or when
a known server secret is present in the build environment. Local Expo development remains usable
without this strict gate.

## Invitation and deep-link contract

The shared URL remains `https://<beta-origin>/invite/<opaque-token>`. The configured origin never
contains the token. The dynamic app config derives only `applinks:<beta-host>` for iOS associated
domains.

- Installed app: a correctly associated HTTPS link opens Expo Router route `/invite/[token]` on
  cold or warm start. The route requires no Kinwin account.
- App not installed: the same host must serve the Expo Router web route and retain the full path.
- Reopen: the same accepted organizer URL returns to the scoped page.
- Share access again: the server rotates the token before native Share opens. The old URL becomes
  unavailable; the new HTTPS URL reaches the same invitation and organizer identity.

The beta web operator must serve `/.well-known/apple-app-site-association` with the Apple Team ID,
`com.kinwin.mobile.beta`, and `/invite/*`, using HTTPS with no redirect. Those Apple/domain values
cannot be fabricated in the repository. Until the AASA file is live, Safari can render the public
route but iOS cannot reliably hand the HTTPS link to the installed app. The custom `kinwin` scheme
continues to support native Stripe return routing; it is not substituted for the public invitation
URL.

## Supabase Auth redirects

The current app implements email/password sign-up and sign-in only. It has no OAuth, magic-link,
password-reset, or native auth-callback route. Do not add redirect allowlist entries for flows that
do not exist. If email confirmation is enabled in TEST, Supabase Site URL must be the public beta
HTTPS origin rather than localhost; confirmation completes in the browser and the user returns to
the app to sign in. Do not weaken email verification for build convenience.

## Stripe and external reward links

The existing Stripe config plugin is included in managed prebuild. PaymentSheet receives only the
TEST publishable key, uses `kinwin` as the standalone return scheme, and still waits for server
webhook authorization. Apple Pay is not enabled. Server keys and consequence charging remain
outside the native binary.

Open reward is explicit. The transient HTTPS URL is passed directly to React Native `Linking` and
is never stored or inserted into app navigation state. The button disables while requesting; the
server cooldown handles races. A browser-open failure now produces retryable product feedback.
Returning from Safari does not imply redemption and does not mutate reward state.

Native Share receives one message containing one invitation URL. Token generation/rotation occurs
on the server before the share sheet; canceling the sheet does not fabricate a sent status.

## Lifecycle expectations

- A dropped request returns a neutral retry state and changes no challenge, payment, or reward truth.
- Backgrounding may let the HTTP request finish; returning shows persisted server truth on reload.
- Cold and warm universal-link opens resolve the same route from the URL, with no local token store.
- Wi-Fi/cellular changes may fail one request but a later explicit retry is safe.
- Returning from PaymentSheet or Safari uses the existing scheme/app lifecycle without claiming a
  payment or reward outcome from the return alone.

## Physical iPhone sequence

1. Install the internal `beta` build; launch cold, sign in, terminate, and verify session restore.
2. Create and activate a TEST challenge; inspect Home, detail, and check-in.
3. Share recipient and organizer access through native Share and Messages.
4. Open each HTTPS link with the app closed, app foregrounded, and app absent in Safari.
5. Accept organizer access, Share access again, verify old URL unavailable and new URL accepted.
6. Verify failure result, owner waiting/preparing/ready states, and organizer preparation state.
7. At ready, press Open reward once, rapid-double-press it, return from Safari, then open again later.
8. Repeat invitation and reward requests offline, during background/foreground, and across a
   Wi-Fi/cellular switch.
9. Review long organizer/recipient names, three and four recipients, Dynamic Type, VoiceOver order,
   and the smallest supported iPhone screen.

## External release prerequisites

- EAS account/project linkage and EAS project ID
- Apple Developer Team, signing certificate, and provisioning profile for the beta bundle ID
- EAS `preview` public environment values
- Public beta web host and valid AASA file
- Supabase TEST Site URL and hosted backend deployment
- Approved Kinwin icon/splash assets; the repository currently has no branded asset set

These are release credentials or brand artifacts, not values Codex should invent or commit.
