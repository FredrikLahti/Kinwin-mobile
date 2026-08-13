# Kinwin Account Deletion — Decision Package

**This document does not implement account deletion.** It exists so the founder can make the decisions engineering should not make alone, before any deletion code is written. Apple requires an in-app path to *initiate* account deletion for any app with account creation (App Store Review Guideline 5.1.1(v)) — Kinwin has account creation, so this is a real public-launch requirement, not a nice-to-have. It is explicitly **not** required for internal or external TEST beta (see `docs/LAUNCH_READINESS.md`).

## The real technical constraint, verified directly in the schema

Every foreign key from Kinwin's financial/challenge tables back to `auth.users` — and the entire chain beneath `challenges` — is declared `on delete restrict`, not `on delete cascade`. Confirmed directly in `supabase/migrations/`:

- `on delete restrict` to `auth.users`: `profiles`, `challenge_drafts`, `challenges`, `memberships`, `private.stripe_customers`, `private.consequence_charge_attempts`.
- `on delete restrict` beneath `challenges`: `challenge_recipients`, `challenge_periods`, `check_in_events`, `consequences` (and everything under it: `private.consequence_provider_references`, `private.consequence_charge_attempts`, `private.reward_fulfillments`), `invitations`, `challenge_reward_organizers`, `private.challenge_period_generations`, `playbook_entries.source_challenge_id`.
- `on delete cascade` to `auth.users` (the deliberate exception): `kin_connections`, `social_activity`, `activity_reactions`, `playbook_entries`.

**Consequence today:** a raw `auth.users` deletion (e.g. via the Supabase Admin API) is already rejected by Postgres for any user who has ever created a profile, a draft, a challenge, a membership row, or a Stripe customer record — which is effectively every real user, since a `profiles` row is created automatically at signup. This is not a gap to design from scratch; it's an existing, deliberate safety net (see `docs/SUPABASE_SCHEMA.md`'s own note: *"restrictive foreign keys intentionally prevent account deletion from cascading through an active financial commitment"*). A real deletion flow must **actively resolve** this whole restrict chain in dependency order before any `auth.users` row can go away — it cannot rely on the database to do it automatically, and it must not simply switch these to `cascade`, which would silently destroy financial/audit history instead of deliberately deciding what happens to it.

---

## Active challenge

**Question:** can the owner delete their account while an activated challenge (`active`, `completion_mode`, or `awaiting_resolution`) is still in progress?

**Constraints:** an active challenge has a live financial promise attached (an authorized Stripe payment method, a stake amount, named recipients waiting on an outcome). Deleting the account mid-challenge would let a user escape a commitment by deleting their way out of it — the entire product's premise is that failure has a real consequence, and "delete my account" cannot become the release valve. `challenges` itself is FK-`restrict`ed from every downstream table, so this is enforceable at the database level, not just a UI rule.

**Options:**
1. **Block deletion outright while any challenge is non-terminal** (status not in `completed_success`, `completed_failure`, `canceled_before_activation`). The UI explains why and points the user to finish or fail the challenge first.
2. **Allow deletion but force early failure first** — auto-fail the active challenge (charge the consequence) as a side effect of requesting deletion.
3. **Allow deletion with the challenge left in limbo**, orphaned to a soft-deleted/anonymized owner.

**Recommendation: Option 1.** Option 2 turns "delete my account" into a side channel that triggers a real money charge without going through the normal completion/evaluation path — a meaningfully different, riskier action than what "delete account" should mean, and it would need its own careful design (e.g., is that even a fair way to fail a challenge?). Option 3 breaks the recipients'/organizer's already-promised experience and leaves financial state ownerless. Blocking is the smallest, safest, and most honest option: it matches the product's own premise that deletion is not an escape hatch.

**Implementation consequence:** the deletion RPC's first check is "does this owner have a challenge in a non-terminal status" — if yes, reject with a clear reason, don't proceed further.

---

## Pending failed-challenge payment

**Question:** what happens if deletion is requested while a consequence charge is `charge_pending`, `requires_payment_method`, `requires_action`, `temporary_failure`, `permanently_failed`, `processing`, or in a state where the Stripe webhook hasn't yet confirmed the outcome?

**Constraints:** deletion must never create a duplicate charge, and must never make an already-owed obligation to a recipient silently disappear. `private.consequence_charge_attempts` already has strict idempotency (unique `idempotency_key`, unique `(consequence_id, attempt_number)`) — that must stay intact regardless of what deletion does.

**Options:**
1. **Block deletion until the charge reaches a truly terminal state** (`succeeded` or `permanently_failed` with the recipient obligation otherwise resolved — see the Reward fulfillment section below for what "resolved" means there too).
2. **Allow deletion, but only after converting the account to a minimal "financial record" identity** (see Completed history below) that the payment worker can still act against without a live, deletable profile.

**Recommendation: Option 1**, same reasoning as Active challenge — this is really a specific case of "non-terminal financial state," not a separate mechanism. A charge that's still `processing`/`requires_action`/mid-retry is not a state deletion should ever race against.

**Implementation consequence:** the same non-terminal check above should also cover `completed_failure` challenges whose consequence hasn't reached `succeeded` or `permanently_failed`+resolved yet — not just challenges that are still `active`.

---

## Reward fulfillment

**Question:** what happens if deletion is requested while a reward is `reward_fulfillment_pending`, a Tremendous order has been created, the LINK is ready, or the organizer hasn't opened it yet?

**Constraints:** the reward is a promise to a named third party (the recipient/organizer), not just internal bookkeeping. `private.reward_fulfillments` is FK-`restrict`ed from `consequences`, and provider references there must stay stable for reconciliation regardless of what happens to the owner's account.

**Options:**
1. **Block deletion until reward fulfillment reaches a terminal state** (`delivered`, or a permanently failed/abandoned state with no outstanding organizer claim).
2. **Allow deletion once the LINK has been generated at least once**, on the theory that the organizer already has what they need.

**Recommendation: Option 1.** A generated LINK is transient by design (never persisted — see `docs/PRIVACY_DATA_INVENTORY.md` §6) and can be regenerated on demand by the organizer as long as the underlying `reward_fulfillments` and `challenge_reward_organizers` rows still exist; Option 2 would risk the organizer being unable to re-open a reward they haven't yet claimed, with no owner account left to investigate the problem against.

**Implementation consequence:** same non-terminal-state gate, extended to check `reward_fulfillments.status` for the challenge's consequence, not just the consequence's own charge status.

---

## Completed history

**Question:** once every challenge on the account is genuinely terminal (succeeded, or failed-and-fully-resolved) and no reward is outstanding, what happens to challenge data, check-ins, results, Playbook entries, social activity, and reactions?

**Constraints:** none of this data has a decided retention period today (see `docs/PRIVACY_DATA_INVENTORY.md`). Two different concerns are tangled together here: what the **user** experiences (does their history vanish) and what Kinwin needs to **keep** for its own operational/audit reasons (see Payment/provider records below, which is narrower and separate).

**Options:**
1. **Hard delete everything Kinwin doesn't have an independent reason to keep** (challenge content, check-ins, results, Playbook, social activity, reactions the user made). Cleanest for the user, matches most people's expectation of "delete my account."
2. **Anonymize in place**: keep the rows (useful for other people's Kin feeds, which reference the same `social_activity`/`activity_reactions` rows) but strip the identity link — replace `owner_id` with a placeholder, drop the display name.
3. **Retain everything indefinitely, deletion only removes login ability.** Not a real deletion; almost certainly does not satisfy Apple's requirement or a reasonable user's expectation.

**Recommendation: Option 1 for the user's own private data (challenge content, check-ins, results, Playbook); Option 2 for the narrow slice visible to other people (a deleted user's past `social_activity`/`activity_reactions` that a Kin's own feed still references)** — deleting those rows outright would also silently rewrite the Kin's own activity history, which isn't obviously the right call either. This is a real product judgment call, not a purely technical one — see the founder-decision list below.

**Implementation consequence:** whichever is chosen, `challenges`/`check_in_events`/`playbook_entries` need an explicit, ordered delete (or anonymize) path that resolves the full `on delete restrict` chain listed above, since nothing cascades automatically today by design.

---

## Kin relationships

**Question:** what happens to Kin edges, requests, blocks, and feed/activity records involving the deleted user?

**Constraints:** `kin_connections`, `social_activity`, and `activity_reactions` already `on delete cascade` from `auth.users` — meaning if the underlying auth user row is ever actually removed, Postgres itself will silently delete these rows. That default was clearly a deliberate choice for this specific set of tables (unlike everything else in the schema, which is `restrict`), but it predates any real deletion flow and hasn't been stress-tested against a product decision about what should happen to a Kin's own feed history.

**Options:**
1. **Let the existing cascade do its job**: connections, activity, and reactions the deleted user made disappear entirely, including from a remaining Kin's own feed.
2. **Convert the deleted user's connections to a "removed" status first** (matching the existing `kin_connections.status='removed'` value, already used for ordinary un-friending) rather than relying on cascade delete, so the remaining Kin's own history isn't silently rewritten.

**Recommendation: Option 2**, for consistency with the Completed history recommendation above (don't silently erase another real user's own activity history) — this also means the deletion flow should *not* just rely on the existing `cascade` behavior as-is; it should explicitly transition `kin_connections` rows first, the same way the existing `remove_kin_connection`-style RPCs already do, rather than deleting the `auth.users` row and letting cascade run blind.

**Implementation consequence:** don't just delete the auth user and trust cascade — explicitly resolve `kin_connections` status first, matching Option 2's semantics.

---

## Recipient / organizer invitations

**Question:** what happens to outstanding invitation tokens, accepted organizer access, rotated tokens, and reward access after the owner's account is deleted?

**Constraints:** the recipient/organizer invitation model is intentionally accountless — a recipient or organizer never needs a Kinwin account to use their private link (`docs/PRODUCT_STATUS.md` §7). This is already gated by the Active challenge / Reward fulfillment blocks above: if those are enforced correctly, by the time deletion is allowed, every invitation on the account is already for a terminal, resolved challenge with no outstanding reward claim.

**Options:**
1. **Leave resolved invitations as historical records** (their token hash, acceptance status) — they're not personally identifying beyond a typed display name, and they document that a reward promise was honored.
2. **Actively expire/invalidate any remaining unresolved token** at deletion time, as a defensive final step even though the earlier gates should already prevent reaching this state with anything unresolved.

**Recommendation: Both** — Option 1 for the historical record (consistent with Completed history's own recommendation), plus Option 2 as a defensive belt-and-suspenders step, since an invitation token that somehow survives past the earlier gates should never remain usable against a deleted account.

**Implementation consequence:** no separate design needed beyond what Active challenge / Reward fulfillment already require, plus one explicit defensive `invitation_status` transition at deletion time for anything not already terminal.

---

## Payment / provider records

**Question:** what is the technical minimum Kinwin needs to keep for Stripe/Tremendous reconciliation, refund/dispute handling, and accounting/audit, versus what can be deleted with the rest of the account?

**Constraints:** Stripe and Tremendous are the actual systems of record for the money that moved (or, currently, would move in TEST mode). Deleting Kinwin's own copies of `customer_reference`, `payment_method_reference`, `stripe_setup_intent_id`, `provider_reference` (the Stripe/Tremendous ids) would not delete anything at Stripe or Tremendous — it would only break Kinwin's own ability to reconcile against them if a dispute or accounting question comes up later.

**Options:**
1. **Retain the minimal provider-reference and amount/status data indefinitely** (or for a legally-advised minimum period — see below), even after the rest of the account is deleted, keyed by an opaque record rather than the deleted user's identity where possible.
2. **Delete provider references along with everything else**, accepting the loss of Kinwin-side reconciliation ability for that historical transaction.

**Recommendation: Option 1**, scoped as narrowly as possible (the `private.consequence_provider_references` / `private.consequence_charge_attempts` / `private.reward_fulfillments` rows and their provider ids and amounts — not the user's display name, goal text, or check-in history, which can genuinely be deleted). **This is exactly the kind of retention period that needs real legal/accounting advice, not an engineering guess — no specific number of days/years is proposed here.**

**Implementation consequence:** the deletion flow should be designed around "delete the person, keep the minimal transaction record" rather than "delete everything" — but the exact boundary and retention length is a founder/legal decision, not resolved by this document.

---

## Supabase Auth user deletion

**Question:** what is the trusted server-side boundary for actually removing the `auth.users` row once everything above is resolved?

**Constraints:** deleting an `auth.users` row requires Supabase's service-role/admin credentials (`supabase.auth.admin.deleteUser()`), which must never reach client code, mobile or web — this is a hard, non-negotiable boundary already respected everywhere else in this codebase (every `service_role`-only operation lives in an Edge Function, never in the client bundle).

**Options — not really options, this is the only architecturally sound shape:**
- A single trusted Edge Function (e.g. `delete-account`), authenticated by the caller's own JWT (so it can only ever delete the caller's own account, the same pattern `create-consequence-setup-intent` and others already use), that: (1) re-validates every non-terminal-state gate above server-side (never trusts a client-side "I already checked" flag), (2) performs the ordered delete/anonymize steps for challenge/social/Playbook data, (3) calls the Supabase Admin API to delete the `auth.users` row last, only after every dependent row is resolved.

**Implementation consequence:** this function does not exist yet and is explicitly not being built in this PR. When it is, it should follow the same "thin Edge Function, pure orchestration logic in a testable `_shared` module" pattern already used throughout `supabase/functions/`.

---

## User experience

**Question:** what is the smallest acceptable in-app flow?

**Not implemented in this PR.** The smallest real flow, once the decisions above are made:

1. **Account → Delete account** — a clearly-labeled, deliberately not-prominent entry point (matching how Sign out is already placed at the bottom of Account settings).
2. **Blocker explanation** — if any non-terminal challenge/payment/reward state exists, explain specifically what's blocking (e.g. "Finish your current challenge before deleting your account") rather than a generic failure.
3. **Explicit confirmation** — a real "are you sure" step naming the consequence in plain language (e.g. "This permanently deletes your account and cannot be undone"), not a bare Yes/No.
4. **Terminal completion state** — a real confirmation screen, not just a silent redirect, once deletion succeeds.
5. **Session invalidation** — signs the user out and clears local session state immediately as part of the same flow, not as an afterthought.

---

## Founder decisions required before implementation

Only the decisions engineering genuinely cannot make alone:

1. **Completed-history model**: hard-delete vs. anonymize-in-place for a user's own challenge/check-in/Playbook data (recommendation: hard-delete), and specifically for `social_activity`/`activity_reactions` still visible in another Kin's feed (recommendation: anonymize rather than cascade-delete).
2. **Kin relationship handling**: whether to override the existing DB-level `on delete cascade` behavior with an explicit "removed" transition (recommendation: yes, for consistency with #1) — this is a real, if small, engineering design choice that follows directly from decision #1, included here because it can't be made before #1 is answered.
3. **Payment/provider record retention**: how long Kinwin should keep the minimal Stripe/Tremendous reference data after account deletion, and in what form (recommendation: retain narrowly, but the actual period needs legal/accounting advice — not proposed here).
4. **Whether "block deletion during any non-terminal challenge/payment/reward state" (recommended throughout this document) is the final policy**, or whether the founder wants a different tradeoff (e.g. forced early failure) despite the product-integrity concerns raised above.
5. **Whether recipients' typed display names on deleted-owner challenges are retained as part of historical/audit record, or removed** — a smaller instance of the same tension as #1, called out separately since recipients never had a Kinwin account of their own to consent to retention.

Nothing above should be treated as decided. This document exists to make those five decisions concrete and answerable, not to answer them.
