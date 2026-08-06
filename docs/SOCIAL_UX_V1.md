# Kinwin Social UX v1 — Interactive Prototype

**Status:** Interactive UX prototype for evaluation. Nothing here is production code, and no
product/UX decision here is final — it exists to be looked at, clicked through, and challenged.

**Relationship to the spec:** This document assumes you have read
`docs/SOCIAL_V1_SPEC.md`. It does not repeat that document's product principles or terminology —
it only refines section 4 (audience/detail), section 11 (Challenge Room), section 12 (Kin feed),
and section 13 (comments/reactions) into concrete screen behavior for the prototype build under
`app/social-preview/`.

## 1. What this package is

An app-owned, high-fidelity, click-through prototype of Kinwin's private social foundation. It
runs entirely on local fixture data (`fixtures/social/`) so the social *experience* can be
evaluated before any database, RLS, or authorization architecture is built. See
`docs/SOCIAL_V1_SPEC.md` section 19 — this prototype exists to produce the "approved UX flow" that
section requires before a future implementation package can begin.

## 2. Routes and navigation

```
/social-preview                        Entry screen — the one place with the full "this is a
                                        prototype" explanation.
/social-preview/(tabs)                 Kin home, two tabs:
  (tabs)/index                           Kin feed (default tab)
  (tabs)/my-kin                          My Kin
/social-preview/add-kin                Add Kin flow (modal presentation)
/social-preview/challenge-room         Challenge Room, keyed by ?challengeId=
/social-preview/audience-preview       Owner-facing audience/detail privacy preview
```

Entry points into the prototype:
- `app/index.tsx` (Kinwin's current temporary landing screen) has a small, clearly-labeled
  "Kin social preview (internal prototype)" link. It is not part of onboarding and does not
  claim to be a production tab.
- The entry screen (`/social-preview`) has a secondary link straight to the audience/detail
  preview, since that screen is a standalone configuration demo rather than something reached
  by tapping through the feed.

Within the prototype: Kin feed cards and My Kin's Add Kin button are the two ways deeper screens
are reached. The Challenge Room is always reached by tapping a feed card, never by direct
guessing of a URL — there is no in-app way to browse challenges outside the feed, matching "no
global search."

## 3. Screen-by-screen

### 3.1 Entry (`/social-preview`)

- Static explanation card: illustrative only, nothing saved, no real network requests, reload
  resets everything. This is the **only** place this explanation appears in full.
- Every other screen carries a small, quiet `PROTOTYPE · NOT SAVED` tag
  (`components/social/prototype-tag.tsx`) instead of repeating the paragraph — satisfying "don't
  repeat intrusive prototype warnings on every screen" while still keeping every screen legible on
  its own if it's opened out of context (e.g. a screenshot).
- Primary action: **Enter Kin (preview)** → Kin feed.
- Secondary action: **Preview challenge privacy settings** → audience/detail preview.

No loading or error state: fixture data is synchronous and local, so there is nothing to wait for
or fail. (Section 6 states where a real backend would introduce both.)

### 3.2 Kin feed (`(tabs)/index`)

- Reverse-chronological list of `SocialFeedItem` fixtures (`fixtures/social/events.ts`): either a
  single-moment card (`SocialEvent`) or a compact **story card** (`SocialFeedStory`) grouping
  several closely-related moments from one challenge. Every card shows an actor avatar + name, an
  eyebrow (event kind, or `STORY` for a grouped card), a headline, a tappable row linking into
  that challenge's Challenge Room, and a `ReactionBar`.
- Event types shown: challenge started, milestone reached, missed commitment, consequence
  activated, consequence completed, and challenge succeeded — a realistic subset of
  `docs/SOCIAL_V1_SPEC.md` section 12's full list. Deliberately excluded: routine check-ins (per
  spec, never individually posted).
- **Story grouping:** the first viewport used to show three near-identical consecutive cards for
  Alex's missed commitment → consequence activated → consequence completed. These are one
  closely-connected story from a single challenge, so they now render as one compact story card
  ("Alex's consequence played out") with a short, ordered list of moments (day label + line per
  moment) inside a single link+reaction unit — the sequence and every fact stay visible, just not
  as three separate cards. This is a fixture/display-level decision (`kind: 'story'` on the feed
  item), not an algorithmic feed or a production grouping system.
- **Success has social value too:** Mia's completed "21-day nightly habit" challenge is a
  first-class feed item (`challenge_succeeded`), not just narrative texture — the seed comments on
  her Challenge Room show genuine praise mixed with joking disappointment about losing out on the
  consequence (see 3.5). This demonstrates that succeeding is also worth talking about, not just
  entertaining failure.
- Three showcase challenges give the feed real variety: Alex's exact-detail "No added sugar for 30
  days" (full lifecycle, told as a story card for its dramatic middle), Priya's general-detail
  "8-week fitness challenge" (shown only as "An 8-week fitness challenge", never the exact
  training plan — demonstrating general-detail redaction directly in the feed), and Mia's
  exact-detail success story.
- **Empty state:** not built. With three fixture challenges there was no natural way to also
  demonstrate an empty feed without contriving another fixture identity; a real implementation
  needs "No Kin activity yet — once your Kin start challenges, you'll see it here."
- **Loading/error:** none in the prototype (synchronous fixtures). A real feed needs pagination,
  a loading skeleton, and a retry-on-failure state — see section 6.

### 3.3 My Kin (`(tabs)/my-kin`)

- Three sections, all backed by local `useState` seeded from `fixtures/social/kin.ts`: pending
  Kinship requests (incoming, with Accept/Decline), sent requests (outgoing, with Cancel), and
  approved Kin. Accept moves a fixture profile from incoming into approved; nothing is ever sent
  anywhere.
- **Add Kin** button at the top, always visible.
- **Empty state:** if a founder clears all fixture requests during a session (accept/decline/
  cancel everything), "My Kin" shows "No approved Kin yet. Add Kin to get started." The pending
  sections simply disappear when empty rather than showing an empty placeholder for each, since a
  request list at zero is not something a user needs explained.
- No stranger suggestions, popularity counts, or discovery — intentionally absent, per spec.

### 3.4 Add Kin (`/add-kin`, modal)

- Single exact-username text field + **Find Kin**. Four deterministic outcomes
  (`lib/social/add-kin.ts`, unit-tested):

  | Try this username | Outcome |
  |---|---|
  | `sam_k` | Exact match, not yet Kin → **Send Kinship request** |
  | `mia.rowan` | Already Kin |
  | `theo_b` | Kinship request already pending |
  | anything else | No exact match |

- Sending a request is local-only: the button is replaced with a confirmation line for the rest
  of the session; nothing appears in My Kin's outgoing list (that list is a separate, unrelated
  fixture — wiring the two together would need real state, out of scope for this prototype).
- The no-match state explicitly states Kinwin only matches exact usernames (no suggestions, no
  public search) and shows a **disabled** "Invite by link (coming soon)" affordance — labeled and
  visibly inert, so it cannot be mistaken for working share/deep-link infrastructure, per the
  task's explicit instruction not to build that here. Its placement — inside Add Kin, next to the
  no-match result, rather than a separate top-level invite flow — is now a locked decision (see
  section 8).
- **Loading/error:** none (synchronous). A real Add Kin needs a debounced/rate-limited server
  lookup, a network-error state, and abuse protection against username enumeration.

### 3.5 Challenge Room (`/challenge-room?challengeId=...`)

The one fully compelling room, built from Alex's "No added sugar for 30 days" challenge (and
reachable in a lighter form for Priya's challenge, which has an empty comment section, and Mia's
success room). Kinwin's social experience is meant to feel like **"the group chat where promises
actually have consequences"** (a locked decision, section 8) — so the room now leads with
conversation, not a full history log. Top-to-bottom order:

1. Header: back, quiet prototype tag, and an overflow (`⋯`) menu.
2. Concise challenge header: title, truthful description, start/planned-end labels, a progress
   bar + label.
3. Consequence card: summary + named recipients.
4. **Comments**, promoted to appear right after the consequence — this is the part that should
   read like a real group chat.
5. Compressed history: only the most recent two lifecycle moments by default, with a **"View full
   history (N more)"** toggle that expands the complete, untruncated timeline. Nothing is removed
   or made less truthful — only how much is shown before an explicit tap. When a challenge has two
   or fewer lifecycle moments (e.g. Priya's), there is nothing to hide, so the toggle doesn't
   appear and every moment is already visible.

Interaction details:
- **Comments:** seeded from `fixtures/social/comments.ts`, with threaded replies. Local text
  composer at the bottom posts a new top-level comment; each comment has its own inline reply
  composer. Both are session-only React state — reloading the app returns to the seed, honestly,
  per the task's explicit requirement.
- **Reactions:** `ReactionBar` on every feed card and every comment/reply, offering six tones
  (fire, you-got-this, lol, oof, icon, respect) rather than a single "like" or purely encouraging
  set — see section 5.
- **Mute:** a toggle inside the overflow menu; state reflected in the room's own header
  ("… · muted") so it's visibly real, not just a silent flag. Muting only affects notifications —
  it does not dim or otherwise change how the challenge's cards look in the Kin feed (locked
  decision, section 8).
- **Report / Block:** in the same overflow menu, each producing an honest inline confirmation
  that nothing was actually sent/changed (this is a prototype) rather than silently doing nothing
  or pretending to hit a server.
- **Empty state:** Priya's room (`challengeId=challenge-priya-running`) has zero seed comments,
  showing "No comments yet. Be the first to say something." — a real empty state, not a
  contrived one, and unchanged by this reordering.
- **Not-found state:** an unrecognized `challengeId` shows "This Challenge Room isn't part of the
  prototype." with a way back, rather than crashing — this is the prototype's stand-in for a real
  404/permission-denied state (see section 6).

### 3.6 Audience/detail privacy preview (`/audience-preview`)

Owner-facing configuration screen, **not** wired into onboarding yet (per task instructions). Lets
you set:

- **Audience:** Only me / All my Kin / Selected Kin (with a Kin picker that appears only for
  "Selected Kin").
- **Visible detail:** Exact challenge / General version / Progress only.

...against Alex's private challenge record, then shows a live preview of exactly what a fixed
approved-Kin viewer (Priya) would receive, computed through the real
`projectSocialChallenge` authorization function (see section 4). If the current audience excludes
Priya, the preview honestly says she "would not see this challenge at all," instead of showing an
empty/broken card.

The simulated preview card itself never contains the words "masked," "hidden," "private version,"
or any other meta-language about redaction — only naturally-worded content, per the spec's
explicit requirement that masking never be visually detectable by the viewer. The *surrounding*
screen chrome ("PREVIEW — WHAT PRIYA WOULD SEE") is owner-only configuration UI, not something a
real Kin viewer would ever see, so it is allowed to describe what it's doing.

## 4. Privacy behavior and the fixture architecture

`docs/SOCIAL_V1_SPEC.md` section 4 requires private challenge data and social display data to be
stored and authorized separately, and this prototype's fixture layout exists specifically to make
that boundary visible in code, ahead of any real backend:

- `fixtures/social/private-challenges.ts` — the PRIVATE record, as only an owner-scoped table row
  would expose it in a real backend. Only two files may import it:
  `lib/social/projection.ts` and `app/social-preview/audience-preview.tsx` (the owner's own
  preview of their own challenge — the one legitimate case for an owner to compute their social
  projection live, rather than receive an already-projected one).
- `lib/social/projection.ts` (`projectSocialChallenge`) — the single authorization + redaction
  function. It is what a real backend's RLS/API layer would eventually implement server-side;
  the prototype runs it client-side only so the preview screen above can be interactive. Returns
  `null` outright for any viewer with no access, so no screen can ever end up holding a
  partially-redacted object for someone unauthorized.
- `fixtures/social/challenge-projections.ts` — the result of running every showcase challenge
  through `projectSocialChallenge` for the fixed "Me" viewer, standing in for what a real API
  response would already contain. **Every Kin-facing screen (Kin feed, Challenge Room) imports
  only this file** — never the private one — so a component can never casually hold a full
  private challenge object "because this is only a prototype."
- `fixtures/social/events.ts` and `fixtures/social/comments.ts` are built only from the
  projections above (or independent flavor text), never from private data.
- `fixtures/social/kin.ts` is the separate Kinship fixture — approved/pending Kin and the Add Kin
  lookup directory — with no coupling to challenge data.

Concretely, this means: **general detail** shows a truthful but generalized title/description
(e.g. "A month of cutting something out" instead of "No added sugar for 30 days"), progress shown
only as `Day X of Y` (the same generic, day-based form as progress-only, since the private
measurement's unit — e.g. "days sugar-free", "runs completed" — would immediately re-name the
exact behavior the title/description just generalized away) — but recipients and the consequence
itself stay visible, because they're central to Kinwin's social meaning, not part of the private
behavior being generalized. Concretely: `recipientNames` becomes the safe first-name form
(`recipientFirstNames` on the private fixture — "Jonas" instead of "Jonas (little brother)"), and
`consequenceSummary` becomes an independently-authored `generalConsequenceSummary` that keeps the
recipients, the consequence type, and its value, but never the private behavior, measurement,
success threshold, or failure rule (e.g. exact: "If Alex misses more than 2 days total, Mom and
Jonas split a $150 spa afternoon"; general: "If Alex doesn't complete the challenge, Mom and Jonas
split a $150 spa afternoon"). **Progress-only detail** goes further still: title becomes
`"{name}'s challenge"`, description becomes a generic "working toward something meaningful" line,
and both recipients and the consequence summary are withheld entirely (`null`). Lifecycle
headlines follow the same three-way split — each `ChallengeLifecycleEvent` carries independently
authored `exactHeadline`/`generalHeadline`/`progressOnlyHeadline` fields (progress-only never
reuses the general wording), so a progress-only viewer sees only safe, generic lines like "Alex
had a setback" or "The challenge consequence was activated" — never an exact detail, and never a
generalized *category* either (e.g. never anything that would let "fitness" leak through). All of
this is unit-tested in `lib/social/projection.test.ts`: general keeps recipients/consequence but
never the private measurement or its threshold; progress-only output never contains the word
"sugar" (the private measurement's telltale unit) in title, description, progress label, or any
lifecycle headline; and general's `progressLabel` is exactly `"Day 22 of 30"`, never the exact
behavior count.

## 5. Interaction behavior notes

- Reactions (`lib/social/reactions.ts`): fire 🔥, you-got-this 💪, lol 😂, oof 😬, icon 👑,
  respect 🫡 — chosen so a Kin can tease, hype, or sympathize the way real friends actually would,
  rather than a single "like" or an exclusively supportive/therapeutic set (spec section 1).
- Haptics follow the existing convention (`lib/haptics.ts`): selection haptics for
  toggles/reactions, "important" haptics for irreversible-feeling actions (sending a Kinship
  request, posting a comment, entering the prototype).
- All interactive elements carry `accessibilityRole`/`accessibilityHint`/`accessibilityLabel`,
  consistent with the rest of the codebase.

## 6. What is fixture-only vs. future backend work

Fixture-only in this package (see `docs/PRODUCT_DECISIONS.md`'s "mock data and local state"
principle):
- Every person, Kinship, challenge, comment, reaction, and lifecycle event.
- Add Kin's outcomes (exact match / already Kin / pending / no match) are a static lookup table,
  not a real query.
- Accepting/declining Kinship requests, muting a room, reporting, and blocking all mutate local
  `useState` only and are lost on reload.

Explicitly **not** built here, and blocked on later spec packages (`docs/SOCIAL_V1_SPEC.md`
section 18):

| Future capability | Blocked on |
|---|---|
| Real Kinship requests/accept/decline, blocks, reports | Package 2 (Kinships) — usernames, requests, and block/report need real tables + RLS. |
| Real audience/detail enforcement at the data layer | Package 3 (audience/privacy) — `projectSocialChallenge`'s logic needs a server-side, RLS-enforced equivalent; the client must never be trusted to redact. |
| Real feed pagination, live events, loading/error/retry states | Package 4 (feed and interaction) — needs `social_events` and a real fetch boundary. |
| Multi-participant Kin Challenges, late joining, per-participant stakes | Package 5–6 — this prototype only ever shows individual challenges (spec section 5), never a Kin Challenge (section 6). |
| Server-confirmed consequence activation/completion, payment-linked events | Package 7 — the "consequence activated/completed" feed and room events here are narrative fixtures, not proof of an actual charge or fulfillment. Payments and consequence charging remain entirely out of scope and untouched (see `docs/PRODUCT_DECISIONS.md`'s Stripe section and PR #12). |
| Real push/neutral-wording notifications, the mute toggle actually suppressing anything | Package 8 — the mute toggle here only changes its own label; there is no notification system yet to suppress. |
| Membership/authorization interplay (e.g. Completion Mode) | Not modeled at all in this prototype — every fixture challenge is presented as fully active. |

## 7. Acceptance criteria

- [x] Runs entirely in the cloud dev environment with local fixture data — no Supabase project,
      Supabase credentials, Stripe configuration, physical device, EAS Build, or other external
      service required.
- [x] `/social-preview` is isolated from production routes; no new permanent tab was added, and
      `app/_layout.tsx` was not modified.
- [x] Kin feed shows a realistic, non-generic set of fixture events and excludes routine
      check-ins.
- [x] Closely-connected events from one challenge (Alex's missed commitment → consequence
      activated → consequence completed) render as one compact story card, not near-identical
      consecutive cards, while keeping the full sequence and every fact visible and linking to
      the Challenge Room.
- [x] The feed includes at least one meaningful success event (Mia) with genuine social value —
      praise and playful disappointment in the room's comments — not only failure/consequence
      drama.
- [x] My Kin distinguishes approved Kin, pending incoming, and pending outgoing, with a working
      Add Kin entry point, using natural compact headings ("Incoming requests", "Sent requests")
      rather than requiring "Kinship requests" in every heading.
- [x] Add Kin demonstrates all four required deterministic outcomes and is clearly not real
      networking (no fetch, no async, an explicit disabled "coming soon" affordance for invite
      links).
- [x] The Challenge Room shows title, owner, dates, progress, consequence summary, named
      recipients, comments, replies, reactions, local comment composition, a mute affordance,
      report/block in an overflow menu, and a lifecycle history — with comments promoted ahead of
      a compressed history (most recent two moments, expandable to the full timeline via "View
      full history").
- [x] The audience/detail preview shows an accurate, meta-language-free preview per detail level,
      including the "no access at all" case for excluded audiences, and confirms that general
      detail keeps recipient first names and a safely generalized consequence while progress-only
      hides both entirely.
- [x] Private challenge data and social projection data are architecturally separate modules, and
      Kin-facing components consume only the projection.
- [x] `docs/SOCIAL_V1_SPEC.md` does not permit participant-approved or user-controlled recipient
      replacement after commitment creation; recipient immutability, contact-detail correction,
      and the support-mediated exception process are stated explicitly.
- [x] Unit tests cover the audience/detail → projection conversion, general detail keeping
      recipient first names and a safe consequence summary, progress-only redaction of both
      recipients and the consequence, progress-only lifecycle wording never matching the exact or
      general wording (and never leaking a generalized category), unauthorized-recipient
      exclusion, and Add Kin's deterministic outcomes.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npx expo export --platform web`, and
      `git diff --check` all pass.

## 8. Locked decisions for Social v1 planning

Approved by the founder for this UX package and carried forward into future implementation
packages:

- Kinwin's social experience should feel like **"the group chat where promises actually have
  consequences"** — not a habit tracker with a feed bolted on. The Challenge Room's comments-
  before-history ordering (section 3.5) is a direct expression of this.
- Social value exists for both success and failure — a completed challenge is worth genuine
  praise and playful disappointment (about a lost consequence), not just narrative filler around
  failure/consequence drama.
- Related lifecycle events from one challenge may be presented as one coherent social story
  (a story card), rather than one card per event, when they're closely connected in time and
  narrative.
- **General** detail shows recipient first names and a safely generalized consequence summary
  (recipients, consequence type, and value — never the private behavior, measurement, success
  threshold, or failure rule).
- **Progress-only** detail hides recipient and consequence details entirely.
- **Selected Kin** uses one challenge-wide detail level in v1 — not per-Kin detail-level
  variation.
- **Invite by link** belongs inside the Add Kin flow (next to the no-match result), not a
  separate top-level invite flow.
- **Muting** a Challenge Room affects notifications only — it does not dim or otherwise change
  that challenge's cards in the Kin feed.
- Consequence delivery, recipient updates, and revenge challenges are part of a challenge's
  **social afterlife** — the story doesn't end at "consequence activated."
- The next UX package should focus on **social onboarding and Kinship flows for a user with no
  existing Kin** (the "cold start" experience Add Kin and My Kin don't yet address).

## 9. Unresolved product decisions

These remain open — flagging them for founder/ChatGPT review before any real implementation
package touches them:

1. Exact late-join voting rules.
2. Who may apply to join a Kin Challenge.
3. Visibility of individual participant stakes.
4. How consequence fulfillment is confirmed and disputed.
5. Moderation and historical-comment behavior after removing or blocking a Kin.
6. Recipient-to-participant transitions in group challenges (i.e. whether an economic recipient
   may later become a participant in a Kin Challenge) — see the corresponding open item in
   `docs/SOCIAL_V1_SPEC.md` section 9.
