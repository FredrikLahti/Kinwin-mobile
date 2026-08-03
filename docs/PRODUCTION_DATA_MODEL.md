# Production data model

## Boundaries

The onboarding context remains a temporary UI draft. A `ChallengeDraft` is a normalized,
editable production draft, while activation creates a separate `ActivatedChallengeSnapshot`.
That snapshot freezes the accepted goal, behavior, measurement, rhythm/boundary, success rule,
recipients, organizer, consequence category, stake, acknowledgement, membership state, dates,
timezone, and engine/schema versions. Later draft edits or app-copy changes therefore cannot
change an active financial commitment.

Rules are structured discriminated unions rather than display sentences. `schemaVersion`,
`ruleVersion`, and `ruleEngineVersion` make old commitments reproducible when implementations
change. Display copy is derived outside persisted contracts.

The existing `OnboardingContext` remains a UI-only draft and also contains presentation state
such as editable input text. `mapOnboardingDraft` is the explicit anti-corruption boundary: it
normalizes the context's plain values, requires caller-supplied identities, and derives structured
rules from the same pure calculation used by the current success-rule display. Display sentences
are never parsed or persisted as business rules. Trusted activation metadata—including challenge
and consequence IDs, timestamps, timezone, and membership state—is supplied later by the backend.

## Runtime and trust

Periods represent day, week, or continuous challenge windows. They must later be generated on
the server in the challenge timezone; this package deliberately performs no timezone arithmetic.
Check-ins are append-only events. New Cut back totals supersede older totals during evaluation,
and future corrections refer to an earlier event instead of rewriting history.

Final evaluation runs on trusted server data. The pure evaluation boundary currently returns typed
`not_evaluable` reasons rather than guessing aggregate or continuity behavior; a versioned server
rule engine remains to be implemented after the unresolved policies are approved. A frontend
failure claim can never initiate charging. Failure evaluation and consequence
processing must be server-side, authorized, auditable, and idempotent.

Challenge status describes the commitment lifecycle. Membership status describes entitlement.
If membership expires during an active challenge, the challenge enters Completion Mode. That mode
keeps required check-ins, current status, final result, and consequence completion, but blocks new
challenges, premium guidance, deeper analytics, recommendations, and other member features.

## Future Supabase table map

- `profiles`: user-owned profile data.
- `challenge_drafts`: editable normalized drafts.
- `challenges`: immutable activation snapshots plus controlled lifecycle status.
- `challenge_recipients`: recipient snapshots associated with challenges.
- `challenge_periods`: server-generated evaluable windows and computed status.
- `check_in_events`: append-only check-in and correction events.
- `consequences`: financial/reward lifecycle independent of challenge result.
- `invitations`: recipient invitation delivery and response state.
- `memberships`: entitlement status and access dates.
- `consequence_charge_attempts`: idempotent attempt history.
- `reward_fulfillments`: fulfillment attempt and delivery history.

No table definition, row-level security policy, provider integration, or migration is specified yet.

## Unresolved decisions

- Exact timezone and daylight-saving period generation.
- Correction policy for mistaken check-ins.
- Evidence or verification requirements.
- Exact Cut back continuity safeguard.
- Payment retry and grace rules.
- Recipient replacement after activation.
- Whether challenge start waits for sharing.
- Account deletion during an active financial commitment.
- Dispute and manual-review process.
- Exact App Store and Google Play entitlement integration.
- Durable identity and contact requirements for an external reward organizer.

See also `docs/SUPABASE_SCHEMA.md` for the initial relational schema, RLS, grants, and trusted-write boundary,
and `supabase/tests/` for the executable validation of that schema against a disposable local database.
The migration must additionally be exercised against a disposable hosted or full local Supabase project
(covering GoTrue/PostgREST) before production use. See `docs/BACKEND_IMPLEMENTATION_PLAN.md` for the
recommended phase-by-phase sequence for building the trusted backend on top of this foundation.
