# Kinwin Social v1 Specification

**Status:** Product scope approved for planning. Implementation has not started as a coherent, connected feature — some UI prototypes for parts of this spec exist in disconnected/orphaned screens (see `docs/PRODUCT_STATUS.md`), but they are not wired into the shipping app. This document is not the current implementation-status source; for what is actually built today, see `docs/PRODUCT_STATUS.md`.

**Purpose:** Define the social foundation of Kinwin as a private network of people the user knows and trusts. This document is the shared source of truth for future Codex, Claude Code, and human implementation work.

## 1. Product principle

Kinwin is not a habit tracker with a passive Share button. It is a private social platform where people make real commitments in front of their Kin, follow and join each other's challenges, react in the tone natural to their relationship, and turn failures into meaningful outcomes for loved ones.

Failure is not treated as shameful. It remains costly and consequential, but it may also become a funny, memorable, and socially meaningful event.

Kinwin does not prescribe a uniformly therapeutic or sweet tone. Friends and family may encourage, tease, or lovingly roast each other within normal safety boundaries.

## 2. Product language

User-facing terminology:

| Concept | Kinwin term |
|---|---|
| Friends / trusted social contacts | **Kin** |
| Friend network | **My Kin** |
| Friend relationship | **Kinship** |
| Friend request | **Kinship request** |
| Add a friend | **Add Kin** |
| Social navigation area | **Kin** |
| Friends-only activity feed | **Kin feed** |
| Shared social challenge | **Kin Challenge** |
| Challenge-specific social space | **Challenge Room** |

“Kin” includes close friends, relatives, partners, and other trusted people. It does not require a biological family relationship.

Technical database and code names may remain generic and explicit, such as `friendships`, `challenge_group_members`, and `social_events`.

## 3. Kinships

Social access is based on mutual, approved Kinships rather than public followers.

V1 supports:

- unique usernames and display names
- adding Kin by exact username
- inviting new Kin through an invitation link
- sending, accepting, declining, and removing Kinship requests
- blocking and reporting users
- viewing My Kin and pending requests

Only approved Kin may see a user's social challenge activity.

Contact-book syncing, public discovery, and suggested strangers are not included in v1.

## 4. Social audience for each challenge

Every challenge has an explicit audience selected during challenge creation:

- **Only me**
- **All my Kin**
- **Selected Kin**

The owner also selects the visible detail level:

- **Exact challenge** — the real goal and behavior are shown
- **General version** — a truthful but less specific social description is shown
- **Progress only** — Kin see progress and outcomes without the exact goal

A masked challenge must not visually reveal that masking is being used.

Private challenge data and social display data must be stored and authorized separately. Kin must never gain database access to the owner's underlying private challenge definition unless the owner explicitly shares the exact challenge.

## 5. Individual social challenges

A user may start a challenge immediately without waiting for anyone else.

Approved Kin may, according to the selected audience:

- view the challenge in the Kin feed
- open its Challenge Room
- comment and react
- receive an invitation to join
- request to join while the challenge is active

## 6. Kin Challenges

A Kin Challenge is a shared social structure containing separate participant commitments.

All participants share:

- the same core behavior and success rule
- the same final date
- the same recipient structure
- the same consequence format
- the same Challenge Room

Each participant has:

- their own join date
- their own financial stake
- their own payment authorization
- their own check-ins and result
- their own consequence if they fail

Participants cannot win money or economic value. Success means no consequence is charged. Failure may activate only the participant's own authorized consequence.

The app may display the combined potential consequence value, but participants' commitments remain technically and financially separate. There is no participant-owned prize pool.

## 7. Joining an active challenge

A Kin Challenge starts immediately for its creator.

### Open joining

The creator may configure an initial open join window of 1–3 days. During this period, invited or eligible Kin may join without participant approval.

### Late joining

After the open join window closes, Kin may still request to join while the challenge is active.

Late joining requires:

- acceptance of the unchanged challenge rule
- acceptance of the existing final date
- selection of an individual stake
- an individual payment authorization
- approval by a majority of current participants

The late participant does not complete missed days and receives no extension. Their actual join date is shown in the Challenge Room.

The creator or participants may close late joining for the challenge. Late joining is unavailable once the challenge has ended.

No fairness adjustment is needed because participants cannot win value from each other. The shared final date remains the central group event.

## 8. Stakes

Each participant chooses their own stake.

Rules:

- the creator may show a recommended amount
- participants are never required to match another person's stake
- every stake requires separate authorization
- no stake may be increased after that participant joins
- the combined potential consequence value is visible in the Challenge Room
- the participant may never receive money, prizes, gifts, discounts, pooled funds, or access to an experience because of any challenge result

## 9. Participants and recipients

Participants and economic recipients are separate roles.

Rules:

- a participant cannot simultaneously be an economic recipient in the same Kin Challenge
- a recipient who joins must give up their recipient role before participation is activated
- recipients are immutable once a commitment is created — they are never replaced by the
  user, by other participants, or through any participant-approval or voting mechanism
- correcting a recipient's contact details (for example a mistyped email) is not the same
  thing as replacing a recipient, and may be supported separately from the immutability rule
  above
- a future exception for a genuinely invalid or unreachable recipient contact may only be
  made through a support-mediated, explicitly authorized, and logged process — never a
  self-service action or a participant vote; no replacement-recipient voting mechanism is
  defined by this spec
- whether an economic recipient may later become a participant in a Kin Challenge is an open
  product question, not yet resolved (see docs/SOCIAL_UX_V1.md)
- participant and recipient changes must be visible in the Challenge Room history
- recipient structure is locked once late joining is closed

Supported consequence structures for v1:

- a shared experience for the recipients
- value divided between multiple recipients
- a gift or experience for one recipient

All Kin may follow and comment without being either participants or recipients.

## 10. Participation in funded experiences

Kinwin never sends consequence value to the participant.

For an exclusive funded experience, the participant explicitly commits not to participate in the experience funded by their own failure.

Kinwin cannot physically guarantee exclusion. This is a social and honor-based commitment supported by named recipients and visible challenge history.

For physical gifts, the recipient owns the gift. Kinwin does not attempt to prohibit normal shared use after delivery.

Challenge outcome and consequence completion are separate states:

- challenge succeeded
- challenge failed
- consequence activated
- consequence completed as agreed
- consequence not completed as agreed

## 11. Challenge Room

Every Kin Challenge has a Challenge Room containing:

- social challenge title and description
- start date and shared final date
- current participant list
- each participant's join date
- each participant's selected stake, unless hidden by a future privacy setting
- combined potential consequence value
- named recipients and consequence format
- major progress and lifecycle events
- comments and reactions
- pending late-join requests and voting status
- final results for all participants
- consequence activation and completion updates

The Challenge Room is the primary place where the group's story develops. The Kin feed surfaces events and links back to the room.

## 12. Kin feed

The Kin feed is chronological and contains only approved Kin activity visible to the current user.

V1 event types:

- challenge started
- invitation received
- join requested
- late join approved or declined
- participant joined
- combined potential consequence increased
- meaningful milestone reached
- final period reached
- participant succeeded
- participant failed
- consequence activated
- consequence completed
- recipient update shared
- revenge challenge started

Routine daily check-ins are not automatically published as separate feed posts.

## 13. Comments and reactions

Approved Kin with access to a challenge may:

- write free-text comments
- reply to comments
- use reactions
- delete their own comments
- mute notifications from a Challenge Room
- report content or users

Kinwin does not generate forced encouragement or prescribe how close friends should speak to each other.

V1 supports text and reactions. GIFs, voice messages, and video are excluded from the first implementation. Optional recipient photos may be considered only after the core social loop works.

## 14. Profiles

Kin profiles are visible only to approved Kin and show only challenges the viewer is authorized to see.

V1 profile content:

- active visible challenges
- completed visible challenges
- successful challenges
- failed challenges
- consequences completed as agreed
- total visible value delivered to loved ones
- shared Kin Challenges with the viewer

Profiles are histories of real commitments, not global status rankings.

## 15. Notifications

V1 notification types:

- Kinship request
- Kinship accepted
- challenge invitation
- join request
- late join vote required
- join approved or declined
- participant joined
- comment or reply
- important milestone
- challenge completed
- consequence activated
- consequence completed

Sensitive challenges use neutral lock-screen and push-notification wording. Exact private challenge content must never be included in notification payloads unless explicitly safe.

## 16. Safety and privacy

V1 requires:

- friends-only social access
- block and report controls
- per-challenge audience selection
- separate private and social challenge representations
- row-level database authorization
- neutral notifications for sensitive challenges
- no public stranger comments
- no exact private goal in analytics, payment metadata, or notification payloads
- server-confirmed events for payments and consequence completion states

The client must not be able to fabricate verified payment or delivery events.

## 17. Not included in Social v1

- public profiles
- one-way public followers
- global or local public feeds
- global leaderboards
- algorithmic recommendations
- stranger discovery
- direct messaging outside Challenge Rooms
- video or voice posts
- public stake rankings
- public trending challenges
- contact-book syncing

## 18. Planned implementation packages

1. **Kin specification and UX flows**
   - finalize screen-by-screen flows and acceptance criteria

2. **Kinships**
   - usernames, Add Kin, requests, invitation links, blocks, and reports

3. **Challenge audience and privacy**
   - Only me, All my Kin, Selected Kin, exact/general/progress-only visibility

4. **Kin feed and interaction**
   - social events, comments, replies, reactions, and muting

5. **Challenge Rooms and initial joining**
   - shared challenge structure, individual commitments, and open join window

6. **Late joining**
   - join requests, majority approval, individual stakes, and shared final date

7. **Results and consequences**
   - individual outcomes, combined final event, activation, and completion history

8. **Notifications and security review**
   - neutral push content, RLS testing, abuse controls, and event authenticity

## 19. Implementation guardrail

No production implementation should begin until the relevant package has:

- approved UX flow
- agreed acceptance criteria
- defined database ownership and authorization rules
- identified dependencies on payments, recipients, or challenge activation

Every implementation package must end with:

- a coherent commit or commit series
- migrations documented in order
- routes and screens listed
- tests and manual verification steps recorded
- known limitations stated
- a concise handoff for the next agent
