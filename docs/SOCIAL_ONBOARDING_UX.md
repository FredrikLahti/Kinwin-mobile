# Kinwin Social Onboarding UX — Interactive Prototype

**Status:** Interactive UX prototype for evaluation. Nothing here is production code, and no
product/UX decision here is final — it exists to be looked at, clicked through, and challenged.

**Relationship to the other social documents:** This document assumes you have read
`docs/SOCIAL_V1_SPEC.md` and `docs/SOCIAL_UX_V1.md`. It does not repeat their product principles
or terminology, and it does not touch or re-review `app/social-preview/` (PR #13's Add Kin, My
Kin, Kin feed, Challenge Room, and audience/detail preview) — that package is preserved as-is.
This document defines a separate, isolated package for the part PR #13 deliberately left
unaddressed: **the cold-start experience for a user with zero Kin**, and the moment their first
Kinship happens.

## 1. What this package is

An app-owned, high-fidelity, click-through prototype of Kinwin's social cold start, running
entirely on session-only fixture state (`fixtures/social/onboarding-directory.ts`,
`contexts/social-onboarding-context.tsx`) under `app/social-onboarding-preview/`. It exists to
produce an approved cold-start UX flow before any real Kinship backend, RLS, or invitation
delivery is built — see `docs/SOCIAL_V1_SPEC.md` section 19.

It is a genuinely separate prototype from `/social-preview`: that package's fixture state
(`fixtures/social/kin.ts`) starts with Alex, Priya, Mia, and Jonas already approved, because it
exists to show an established Kin feed and Challenge Room. This package's persona starts at true
zero — no Kin, no requests, no username — because that is the specific experience it evaluates.

## 2. Routes and navigation

```
/social-onboarding-preview                    Entry/hub — the one place with the full "this is a
                                                prototype" explanation, plus a "start the journey"
                                                button and a review-jump list to every screen state.
/social-onboarding-preview/cold-start          Journey 1 — no Kin at all, and the respected solo
                                                continuation (same screen, before/after state).
/social-onboarding-preview/username            Journey 2 — optional social identity (modal).
/social-onboarding-preview/add-kin             Journey 3 — Add Kin by exact username (modal).
/social-onboarding-preview/invite              Journey 4 — invite someone without Kinwin.
/social-onboarding-preview/incoming-request    Journey 5 — incoming Kinship request, and the
                                                restrained "now Kin" confirmation once accepted.
/social-onboarding-preview/remove-kin          Journey 6 — removing an approved Kin.
/social-onboarding-preview/challenge-audience  Journey 7 — first challenge audience transition.
/social-onboarding-preview/existing-solo-challenge  Journey 8 — an existing solo challenge, met by
                                                a first Kin.
```

Entry points:

- `app/index.tsx` has a second small, clearly-labeled link — "Social onboarding UX preview
  (internal prototype)" — next to the existing `/social-preview` link. Neither is a production
  tab, and `app/_layout.tsx` was not modified.
- Within the prototype, the hub (`/social-onboarding-preview`) is reachable from every other
  screen's back button, and offers two ways through the material:
  1. **"Start the cold-start journey"** resets all fixture state to true zero and pushes Journey
     1 — the same click-through path a real new user would experience end to end (add Kin → send
     a request → someone else's request arrives → accept → set your first challenge's audience →
     optionally remove a Kin).
  2. **A numbered review-jump list**, one link per screen state a founder needs to look at
     (matching this document's section 8 review list). Each link seeds only the fixture state that
     specific screen needs (e.g. "First accepted Kin" seeds one already-approved Kin) so any
     screen can be inspected on its own, without re-driving the whole flow first.

## 3. Why "Invite someone" appears in two places

`docs/SOCIAL_UX_V1.md` section 9 locks "Invite by link belongs inside the Add Kin flow, not a
separate top-level invite flow" for `/social-preview`. This package's cold-start screen
(Journey 1) also offers "Invite someone" as one of its three top-level actions, per this
package's own task instructions. These are not in conflict: there is still exactly **one** invite
screen and **one** invite experience (`/social-onboarding-preview/invite`) — Journey 1's button and
Add Kin's no-match result are two entry points into that same single screen, not two competing
invite flows. Nothing about invitations is duplicated or maintained twice.

## 4. Screen-by-screen

### 4.1 Entry/hub (`/social-onboarding-preview`)

Static explanation card (illustrative only, nothing saved, reload resets everything) — the only
place this explanation appears in full, matching `/social-preview`'s convention. Every other
screen carries the shared `PrototypeTag` instead. See section 2 for the two ways through the
material from here.

### 4.2 Journey 1 — cold start (`/cold-start`)

A genuine zero-Kin state: no approved Kin, no incoming or outgoing requests, no username. The
screen explains Kin's value through what a Kin feed will eventually contain — real commitment
moments ("Alex started: 30 days with no added sugar.", "Mia finished the challenge — no
misses.") — explicitly not "your feed is empty" and not routine check-ins, per
`docs/SOCIAL_V1_SPEC.md` section 12 and `docs/SOCIAL_UX_V1.md` section 2.

Three actions, all equally weighted in code (no dark-pattern sizing toward "Add Kin"):

- **Add Kin** → if no username yet, routes through Journey 2 first, then Add Kin.
- **Invite someone** → if no username yet, routes through Journey 2 first, then the invite screen.
- **Continue solo** → replaces the three-action prompt with a confirmation card: Kinwin works
  fully solo, nothing about setup or completing a challenge requires Kin, and there is no
  deadline or nag to add someone later. This is the same route, not a separate "success" screen —
  the hub's review link #2 jumps straight to this post-confirmation state.

### 4.3 Journey 2 — optional social identity (`/username`)

Only reached when the user first attempts to add or invite Kin (never during ordinary account
creation or solo use) — Journeys 1, 3, and 4 all gate on `identity.username` and route here with a
`next` param, then return automatically once saved.

Deterministic states, all exercised through one text field:

| State | How to reach it |
|---|---|
| Empty | Tap "Check availability" with nothing typed. |
| Invalid format | Type e.g. `1abc` (starts with a digit) or `ab` (too short). |
| Available | Type an untaken, valid username, e.g. `sam_k`. |
| Unavailable | Type a taken username, e.g. `alex_r` or `mia.rowan`. |
| Saving | Tap "Save" on an available result — a ~600ms local delay, no real network call. |
| Saved | Automatic after saving; briefly confirms `@username`, then returns to where you came from. |

The screen distinguishes username (exact-lookup only in Add Kin — no public directory, browsing,
suggestions, or fuzzy/partial-name search) from display name (shown on cards, can be anything,
used everywhere else). **Corrected per founder review:** the copy no longer claims a username
"can't be guessed" or that "no one can browse or search for it by guessing" — that was false. The
truthful claim is narrower: there's no directory or browsing, but a username is not a secret
credential, and someone who knows or correctly guesses the exact string can still look the account
up, the same way any exact-match lookup works. The screen also states plainly that a real backend
will need rate limiting and username-enumeration protection on this lookup, which this prototype
does not model.

**Username format** (a prototype decision, not backend-final — see section 10): 3–20 characters,
lowercase letters, digits, dots, or underscores, starting with a letter
(`lib/social/username.ts`). Case-insensitive matching.

### 4.4 Journey 3 — Add Kin by exact username (`/add-kin`)

Builds on `lib/social/add-kin.ts`'s `lookupUsername` from PR #13, unchanged. Sam (`sam_k`) is this
package's one discoverable fixture person; every required outcome is reached by actually driving
Sam through real Kinship-request state rather than a static outcome table:

1. Search `sam_k` → **exact match** → "Send Kinship request".
2. Send it → Sam becomes an outgoing request. Search `sam_k` again → **request already pending**,
   with "Withdraw request" and a prototype-only "Simulate: they accepted" action (standing in for
   Sam accepting from their own device/session).
3. Withdraw → back to exact match. Simulate-accept instead → Sam moves straight to My Kin. Search
   `sam_k` again → **already Kin**.
4. Search anything else → **no match**, with copy that explicitly states Kinwin only matches exact
   usernames (no suggestions, no public search), and a working **"Invite by link"** button leading
   to Journey 4 — no disabled "coming soon" placeholder in this package, since Journey 4 is fully
   built here.

If reached with no username saved yet, the screen shows an identity-gate card instead of the
search field (see Journey 2).

### 4.5 Journey 4 — invite someone without Kinwin (`/invite`)

No real deep link, OS share sheet, SMS, email, or delivery. Shows:

- **From**: the current session's own `@username` (identity-gated, same as Add Kin).
- **Invitation link**: an illustrative `https://kinwin.app/i/…` string (`lib/social/invitation.ts`,
  a random token — never a working URL).
- **Suggested message**: pre-filled text naming the sender.
- **Copy link**: flips a local "Copied ✓" label for ~1.8s; nothing touches a real clipboard.
- **What this invite does and doesn't do**, stated explicitly: the recipient sees who invited them
  and chooses whether to create an account; the invite never reveals any challenge detail; and
  even once Kin, they see no old, current, or future challenge until explicitly included in that
  challenge's audience.

**Corrected per founder review — invitation acceptance now creates the Kinship directly.** The
original version of this screen said the invited person would still need to be found separately
through Add Kin after accepting — unnecessary friction that reduced the invitation to little more
than an app-download link. The model now is: the sender already expressed intent by issuing the
invitation, so the recipient's explicit accept/decline is enough on its own to create (or not
create) the mutual Kinship — see `lib/social/invitation.ts`'s `acceptInvitation`. Challenge access
is still never automatic either way.

**Invited-recipient preview.** A dedicated section below the sender's own view, "PREVIEW — WHAT AN
INVITED PERSON SEES", demonstrates the other side of this same flow using a fixed example inviter
(Fredrik, `fixtures/social/onboarding-directory.ts`) rather than the current session's own
identity: **"Fredrik invited you to become Kin."** with working Accept/Decline buttons. Accept
really calls `acceptInvitationFrom(FREDRIK)` against the same `approvedKin` state every other
screen reads (so Fredrik then shows up in My Kin, remove-Kin, etc.) — this is a real state
transition, not a cosmetic mockup, and the confirmation explicitly repeats that Fredrik still can't
see any challenge until individually included. Decline changes nothing.

Token expiration, reuse, wrong-recipient handling, and single-use semantics remain explicitly
unresolved (see section 10) — the new Kinship-on-accept model does not answer any of them.

### 4.6 Journey 5 — incoming request (`/incoming-request`)

Three states on one route, depending on fixture state:

1. **A pending incoming request** (Theo, `theo_b`) — minimal identity (name, username,
   relationship note), an explicit "this is all Kinwin shows before you decide" line, Accept,
   Decline, and a Report/Block entry point (`OverflowMenu`, reused from PR #13's Challenge Room)
   with the same honest "nothing was actually sent" prototype confirmation.
2. **No pending request, but at least one approved Kin** — a restrained confirmation ("You and
   Theo are now Kin.") that explicitly states they still can't see any challenge unless
   individually included, and any past challenges stay exactly as private as before — then a
   compact My Kin list and a link forward into Journey 7.
3. **Neither** — an honest empty state with a prototype-only "Simulate: Theo sent you a request"
   button, since this screen cannot itself originate a real incoming request from someone else's
   session.

### 4.7 Journey 6 — removing Kin (`/remove-kin`)

A tappable My Kin list; selecting someone expands an inline confirmation that separates five
distinct things, each explicitly tagged **DECIDED** or **UNRESOLVED** so the two categories are
never visually conflated:

- **The Kinship itself** (DECIDED) — ends; you'd need a new request to reconnect.
- **Future, not-yet-authorized challenges** (DECIDED) — the removed person is no longer eligible
  for any challenge you haven't already included them in; this takes effect immediately for
  anything new.
- **An already-active challenge they can currently see** (UNRESOLVED) — **corrected per founder
  review**: the previous copy claimed the removed person "loses access… immediately," which
  overstated what this prototype can honestly claim. It now says plainly that whether removal
  immediately revokes access to a challenge they can currently see is undecided, and does **not**
  claim instant removal from an already-active Challenge Room.
- **Completed challenge history** (UNRESOLVED) — split out as its own category from "already-
  active," since a finished challenge's visibility is a separate open question from a live one's.
- **Comments already made** (UNRESOLVED) — unchanged; no historical-erasure policy is invented.

Confirming calls `lib/social/kinship-requests.ts`'s `removeApprovedKin`, which only ever removes
future eligibility from the approved-Kin list — it has no way to touch a challenge's already-locked
audience (see `lib/social/challenge-audience.test.ts`'s cross-module test proving removal doesn't
change an already-locked challenge's access).

### 4.8 Journey 7 — first challenge audience choice (`/challenge-audience`)

Reached after a first accepted Kin. Uses this package's own audience model
(`domain/social/onboarding.ts`), deliberately **not** `fixtures/social/private-challenges.ts` — no
private challenge object is duplicated into this screen, only a generic fixture title/progress
line, matching `docs/SOCIAL_V1_SPEC.md` section 4's private/social separation requirement.

**Corrected per founder review — an explicit lock, not a tap-to-commit.** The original version
locked "All my Kin" permanently the moment it was tapped. The model now separates two states:

- **Editable audience intent** (`state.audienceIntent`) — freely changeable, and grants **no
  access at all** on its own, no matter which option is selected. Choosing "All my Kin" only
  *previews* the currently approved Kin (a live chip list, "PREVIEW — CURRENTLY APPROVED KIN");
  choosing "Selected Kin" only lets you pick people in a chip picker. Switching between Only me /
  Selected Kin / All my Kin is always one tap with no confirmation friction, matching "allow
  returning to Only me without friction."
- **Locked audience snapshot** (`state.lockedAudience`, `null` until locked) — created only by the
  explicit **"Lock audience for this challenge"** action (`lib/social/challenge-audience.ts`'s
  `lockAudience`), which freezes the intent into a snapshot. Editing the intent again after a lock
  clears `lockedAudience`, requiring an explicit re-lock — a stale snapshot can never silently keep
  describing an intent the owner has since changed.

Only a locked snapshot is ever checked for access: `hasSocialVisibility`/`kinHasAccess` both return
`false`/no-access whenever `lockedAudience` is `null`, so an unlocked "All my Kin" or "Selected
Kin" behaves exactly like "Only me" for every access purpose — **Only me remains the true default**,
and **Selected Kin with zero picks stays invisible even after locking** (empty `audienceKinIds`).

Once locked with `kind: 'all_kin'`, a live "WHO CURRENTLY HAS ACCESS" list appears, and a
"Simulate: Nora becomes Kin now" button demonstrates the retroactive-access rule concretely: Nora
joins My Kin *after* the lock, and immediately shows "joined after the lock — no retroactive
access" next to her name — because the lock froze the approved-Kin id list at that exact moment
(see `lib/social/challenge-audience.test.ts`'s pre-lock/post-lock tests).

**Which real server event performs the lock — commitment creation vs. final challenge activation —
is unresolved** (section 10); the screen states this explicitly next to the Lock button rather than
guessing.

The preview card ("PREVIEW — WHAT X WOULD SEE") is driven by `lockedAudience`, not the editable
intent: before any lock, it honestly says "Not shared yet — nothing is visible to anyone until you
lock the audience above," reusing the same `hasSocialVisibility`/`kinHasAccess` functions the
audience picker itself uses — not a second, separately maintained approximation.

### 4.9 Journey 8 — existing solo challenge, met by a first Kin (`/existing-solo-challenge`)

A standalone scenario (its own local fixture challenge, "Meditate 10 minutes every morning",
already active) demonstrating that adding Kin never touches an existing challenge. Two respected
options — "Keep this challenge private" (a no-op confirmation, since that's already true) and "Use
Kin on your next challenge instead" (forwards to Journey 7, leaving this challenge untouched) —
and an explicit explainer for why there is **no** "make it visible now" button: whether an
already-active challenge's visibility can ever change after activation is unresolved (section 10),
and this prototype does not pretend an answer exists.

## 5. State and fixture architecture

One typed prototype state model, `contexts/social-onboarding-context.tsx`'s
`SocialOnboardingState`, covers: social identity, approved Kin, incoming requests, outgoing
requests, invitation state, and the Journey 7 audience **intent** plus its separate **locked
snapshot**. It is `useState` inside `SocialOnboardingProvider`, wrapping
`app/social-onboarding-preview/_layout.tsx` — entirely session-only, and resets honestly because
the provider itself remounts fresh on reload. No repository or API-shaped abstraction wraps this
state; it is plainly local `useState`, per `docs/PRODUCT_DECISIONS.md`'s "mock data and local
state" principle.

All state transitions are implemented as pure functions the context only calls, never inlines:

- `lib/social/username.ts` — `checkUsername` (format + fixture availability).
- `lib/social/kinship-requests.ts` — `sendOutgoingRequest`, `withdrawOutgoingRequest`,
  `acceptIncomingRequest`, `declineIncomingRequest`, `simulateOutgoingAccepted`,
  `removeApprovedKin`.
- `lib/social/challenge-audience.ts` — `chooseOnlyMeIntent`, `chooseAllKinIntent`,
  `chooseSelectedKinIntent`, `lockAudience`, `hasSocialVisibility`, `kinHasAccess`.
- `lib/social/invitation.ts` — `createInvitation`, `acceptInvitation`.

Two context actions (`seedIdentityForReview`, `seedApprovedKinForReview`) exist solely for the
hub's review-jump list and are never called by any of the actual journey screens — they are
clearly named and confined to `app/social-onboarding-preview/index.tsx`.

`fixtures/social/onboarding-directory.ts` defines this package's own cast (Sam, Theo, Nora,
Fredrik, and the taken-username list) — separate from `fixtures/social/kin.ts`, which seeds
`/social-preview`'s already-populated My Kin and must not be reused here (a cold-start persona
can't start zero while also reusing profiles the other prototype already treats as long-approved).

Journey 7's audience model is intentionally its own pair of types
(`domain/social/onboarding.ts`'s `OnboardingChallengeAudienceIntent` and
`LockedChallengeAudience`), not PR #13's `ChallengeAudience`/`selectedKinIds` shape on
`PrivateChallengeFixture` — this package never imports or modifies
`fixtures/social/private-challenges.ts` or `lib/social/projection.ts`.

## 6. Privacy and access rules demonstrated

- Accepting a Kinship — via `acceptIncomingRequest`, `simulateOutgoingAccepted`, **or the new
  `acceptInvitation`** — only ever returns an updated Kin/request list. None of the three has a
  parameter or return path that could grant challenge access, so "accepting a Kinship does not
  itself grant access to any challenge" holds by construction for every path that creates one, not
  just the ones that existed before this round of corrections.
- An unlocked audience intent (`lockedAudience === null`) grants access to nobody, no matter which
  option — Only me, Selected Kin, or All my Kin — is currently selected. Only `lockAudience`'s
  output is ever checked for access.
- `lockAudience` with `kind: 'all_kin'` freezes the approved-Kin id list at the exact moment of
  locking — a Kin approved after that moment is provably excluded (see
  `lib/social/challenge-audience.test.ts`'s pre-lock/post-lock tests).
- `chooseOnlyMeIntent()` and an empty `chooseSelectedKinIntent([])` both produce zero social
  visibility, locked or not, regardless of how many Kin exist.
- `removeApprovedKin` only ever removes future eligibility from the approved list; it has no way
  to touch an already-locked `LockedChallengeAudience`, matching Journey 6's explicit "no invented
  erasure, no claimed instant removal from an active Challenge Room" — proven directly by a
  cross-module test that removes a Kin and then re-checks their already-locked access.
- `createInvitation` returns only link/message/sender fields — nothing it returns can be passed to
  any access check, so an invitation record alone can never grant challenge access. Actually
  *accepting* an invitation (`acceptInvitation`) does create a Kinship, exactly like the other two
  Kinship-creation paths above, and is bound by the same access rule — proven in
  `lib/social/invitation.test.ts`.

## 7. Interaction and accessibility conventions

Reuses PR #13's established conventions unchanged: `PrototypeTag` on every screen but the entry
hub, `KinAvatar`, `OverflowMenu` for the block/report entry point, `AnimatedPrimaryButton` for
primary actions, `lib/haptics.ts`'s selection/important haptics on every interactive action, and
`accessibilityRole`/`accessibilityHint`/`accessibilityLabel` on every interactive element.

## 8. Visual review list (390×844)

1. True no-Kin cold start (`cold-start`, fresh state).
2. Respected solo continuation (`cold-start`, after "Continue solo").
3. Username available (`username`, e.g. `sam_k`).
4. Username unavailable (`username`, e.g. `alex_r`).
5. Corrected username privacy explanation (`username`, the intro/explainer copy — no "can't be
   guessed" claim).
6. Add Kin — exact match (`add-kin`, search `sam_k`).
7. Add Kin — no match (`add-kin`, search anything else).
8. Sender invitation (`invite`, link/message/what-it-does-and-doesn't-do).
9. Invited-recipient preview, pre-decision ("Fredrik invited you to become Kin.") and post-accept
   confirmation (`invite`, the "PREVIEW — WHAT AN INVITED PERSON SEES" section).
10. Incoming Kinship request (`incoming-request`, Theo pending).
11. First accepted Kin (`incoming-request`, after accept).
12. Remove-Kin confirmation with all five categories, DECIDED/UNRESOLVED tags visible
    (`remove-kin`, a Kin selected).
13. All my Kin — before lock (`challenge-audience`, "All my Kin" chosen, preview chips shown, no
    lock badge).
14. All my Kin — after lock, and after Nora joins (`challenge-audience`, locked, "Simulate: Nora
    becomes Kin now" already tapped).
15. Selected Kin picker (`challenge-audience`, Selected Kin active).
16. Existing active solo challenge, met by a first Kin (`existing-solo-challenge`).

Most of these are reachable directly from the hub's review-jump list (section 2); states 5, 9, 13,
and 14 require a few extra taps on top of a review-jump link (the link seeds the fixture state,
the taps drive the specific sub-state) — see section 11 for exactly how each screenshot was
captured.

## 9. Fixture-only vs. future backend work

Fixture-only in this package:

- Every person (Sam, Theo, Nora, Fredrik), username availability check, Kinship request,
  invitation, invitation acceptance/decline, and challenge-audience intent and lock.
- Username saving's ~600ms "saving" delay is a local `setTimeout`, not a real network round trip.
- Accepting/declining/withdrawing requests, accepting/declining an invitation, removing Kin, and
  choosing/locking a challenge audience all mutate local `useState` only and are lost on reload.

Explicitly not built here, and blocked on later spec packages
(`docs/SOCIAL_V1_SPEC.md` section 18):

| Future capability | Blocked on |
|---|---|
| Real username registration/uniqueness enforcement, rate limiting, and enumeration protection | Package 2 (Kinships) — needs a real `usernames`/`profiles` table with a uniqueness constraint, plus abuse controls this prototype explicitly does not model (section 4.3). |
| Real Kinship requests, accept/decline, block/report | Package 2 — needs real tables + RLS; this prototype's transitions are all local. |
| Real invitation links, delivery, token verification, and acceptance flow | Package 2 — needs a real invitation table with expiration/reuse/single-use semantics (all unresolved, section 10); no deep link exists yet. |
| Real audience lock and enforcement at the data layer | Package 3 — this package's `lockAudience`/`hasSocialVisibility`/`kinHasAccess` are the same *kind* of authorization boundary as PR #13's `projectSocialChallenge`, but neither is backed by RLS yet, and the real event that performs a lock (commitment creation vs. activation) is unresolved. |
| Loading and network-error states everywhere | No screen here has one — every fixture read/write is synchronous and local. A real implementation needs loading skeletons, retry-on-failure, and optimistic-update rollback for every request/accept/decline/remove/invite/lock action. |
| Push notifications for incoming requests/acceptance | Package 8 — nothing here notifies; the incoming request only appears because the fixture state already contains it. |

## 10. Unresolved decisions

Flagging these explicitly for founder/ChatGPT review before any real implementation package
touches them — not resolved here merely for convenience:

1. **Username format and rename rules.** This prototype uses 3–20 lowercase alphanumeric/dot/
   underscore characters (`lib/social/username.ts`) as a working assumption for the click-through,
   not a backend-approved format. Whether usernames can ever be changed, and what happens to
   outstanding lookups/invitations referencing an old one, is undecided. (Corrected per founder
   review: this prototype no longer claims a username is unguessable — see section 4.3 — but
   whether a real backend adds any further protection beyond rate limiting/enumeration defenses is
   also undecided.)
2. **Invitation token expiration, reuse, and wrong-recipient handling.** Whether an invitation link
   expires, how many times it can be used, and what happens if it's opened by someone other than
   the intended recipient are all undecided — this prototype's link is a static string with no
   lifecycle at all. **Unchanged by the Fix 1 correction**: creating the Kinship directly on accept
   makes the flow more useful, but does not by itself answer any of these token-level questions —
   a real token could still be reused, forwarded, or opened by the wrong person, and none of that
   is resolved here.
3. **What happens to historical comments after removing or blocking Kin.** Explicitly surfaced in
   Journey 6's confirmation UI rather than answered — matches the existing open item in
   `docs/SOCIAL_UX_V1.md` section 10.
4. **What happens to an already-active challenge's access when the shared Kin is removed.** Split
   out from item 3 as its own explicit unresolved category in Journey 6 (section 4.7) — this
   prototype does not claim the removed person is instantly cut off from a Challenge Room they can
   currently see.
5. **Whether active-challenge visibility may ever be expanded or reduced after activation.**
   Journey 8 explicitly declines to offer this rather than assume an answer.
6. **Which real server event performs the challenge-audience lock.** Journey 7's explicit "Lock
   audience for this challenge" action (section 4.8) proves *that* some explicit moment must exist,
   but not *which* one — commitment creation and final challenge activation are both plausible, and
   this prototype does not choose between them.
7. **What information a requester may see before acceptance.** Journey 5 shows only name,
   username, and relationship note before Accept/Decline — whether that's the final answer (e.g.
   should mutual-Kin count be visible?) is undecided.
8. **Account deletion while Kinships or active commitments exist.** Not modeled anywhere in this
   prototype; no screen here represents account deletion at all.

## 11. Screenshot capture method

Per founder review, screenshots are captured against the static Expo web export rather than the
Expo dev server (which depends on a network-reachable version-check endpoint the sandboxed CI/dev
environment can't always reach):

1. `npx expo export --platform web` — produces `dist/`, a single-page app (`dist/index.html` plus
   an `_expo/static/js/web/entry-*.js` bundle); expo-router here renders every route client-side,
   there is no per-route static HTML.
2. A minimal Node static file server (no dependencies) serves `dist/` and falls back to
   `index.html` for any path that isn't a real file on disk — required so a direct navigation to,
   e.g., `/social-onboarding-preview/challenge-audience` resolves to the SPA shell and lets
   expo-router's client-side router take over, instead of 404ing on a path with no matching file.
3. Playwright (Chromium, 390×844 viewport) drives the served app: it opens the hub, uses the
   review-jump links to seed each screen's fixture state, performs the few extra taps a given
   state needs (e.g. typing a username, choosing "All my Kin", tapping "Lock audience for this
   challenge"), and screenshots.

All sixteen numbered states from section 8 were captured successfully this way; none required
falling back to the Expo dev server, and the static server itself had no errors — every request it
served returned 200 (verified with a direct `curl` smoke test against both `/` and a nested
client-side route before running Playwright).

One bug was found and fixed during this pass: the hub's "6. Incoming Kinship request" review link
seeded an empty identity/Kin state but never actually added Theo's incoming request, so following
that specific link landed on the screen's empty state instead of the intended pending-request card.
Fixed by having that link also call `receiveIncomingRequest(THEO)`
(`app/social-onboarding-preview/index.tsx`).
