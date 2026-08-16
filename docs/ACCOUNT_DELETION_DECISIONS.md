# Kinwin Account Deletion — Decision Package

**STATUS: IMPLEMENTED**, for the current TEST-beta product, as of main `75268fd` + this package. The decisions below were made by the founder and are now built: `supabase/migrations/20260903000000_account_deletion.sql` (the eligibility check and the ordered delete), `supabase/functions/delete-account/` (the trusted Edge Function, including the Supabase Admin API call that removes `auth.users` last), and `app/account/delete-account.tsx` (the in-app UI). See `supabase/tests/340_account_deletion.sql` and `supabase/tests/e2e/account-deletion.e2e.ts` for the test coverage. Apple requires an in-app path to *initiate* account deletion for any app with account creation (App Store Review Guideline 5.1.1(v)) — Kinwin has account creation, so this was a real public-launch requirement, not a nice-to-have; it is now resolved for the TEST-beta product. What remains explicitly unresolved is called out inline below and in this document's closing section: production real-money retention of payment/provider records is a genuine, separate, not-yet-designed follow-on, not solved by this pass.

**Two things this document's original prose got wrong once verified directly against the current schema, at implementation time** (kept here rather than silently corrected, since catching this kind of drift was an explicit part of the task):
1. `challenges.challenge_status` gained an `awaiting_resolution` value after this document was first written (`20260820000000_challenge_completion_lifecycle.sql`). The implemented eligibility check does not enumerate non-terminal statuses at all — it uses a terminal *allow-list* (`completed_success`, `completed_failure`, `canceled_before_activation`, `superseded`), so any future status value defaults to blocking deletion, not silently allowing it through.
2. Three triggers make specific rows physically undeletable by *any* role, including `service_role`, independent of the `on delete restrict` foreign keys discussed below: `check_in_events` (append-only, unconditional), `challenge_drafts` once archived, and `challenge_reward_organizers` (canonical-organizer immutability). None of this document's original analysis anticipated that — the real implementation needed a narrow, additive, DELETE-only exception on each of these three triggers (gated by a transaction-local flag only the deletion function itself ever sets), on top of resolving the `on delete restrict` chain below. See the migration file's own header comment for the full reasoning.

---

*The rest of this document is preserved as the original decision record — the reasoning and options considered before implementation, not a description of what still needs deciding.*

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

**Constraints:** none of this data has a decided retention period today (see `docs/PRIVACY_DATA_INVENTORY.md`). Three different kinds of data get conflated under "completed history" and need separating before picking an option:

- **(A) The deleting user's own owned content** — their own challenge content, check-ins, results, Playbook entries, `social_activity` rows they generated, and `activity_reactions` rows they personally left on someone else's activity.
- **(B) Another real user's independent content that merely references the deleted user** — a remaining Kin's own `social_activity`/`activity_reactions` rows are owned by that Kin, not by the deleting user, and are untouched by this section; the only thing that changes for them is that reactions *other people made on the deleting user's own activity* (rows in `activity_reactions` that reference the deleted user's `social_activity` row) necessarily disappear when that activity row is deleted — the same way deleting a post deletes the comments on it. That is an ordinary, expected consequence of deleting content the user owns, not a case of erasing someone else's independent content.
- **(C) Legally/financially required records** — covered separately below (Payment/provider records and Recipient/organizer invitations), not by this section.

**Options (for category A, the deleting user's own content):**
1. **Hard delete it** — the deleting user's own `challenges`/`check_in_events`/`playbook_entries`/`social_activity`/`activity_reactions` rows. This matches Apple's current account-deletion guidance directly: users expect content they created, or shared with other people through the app, to actually be deleted when they delete their account, not merely anonymized in place absent a specific legal or regulatory reason to keep it.
2. **Anonymize in place instead**: keep the `social_activity`/`activity_reactions` rows, strip the identity link (replace `owner_id` with a placeholder, drop the display name). Kept here as an option, not the recommendation, because it carries real, stated cost: it does not clearly satisfy Apple's current "users expect their shared content to be deleted" framing, it requires schema work this codebase does not have today (`owner_id` is currently a non-null foreign key to `auth.users`, so anonymizing in place means introducing a nullable/de-identified column or a separate tombstone/archival structure), and it would need its own legal review before being relied on as a substitute for deletion.
3. **Retain everything indefinitely, deletion only removes login ability.** Not a real deletion; almost certainly does not satisfy Apple's requirement or a reasonable user's expectation.

**Recommendation: Option 1.** Hard-delete the deleting user's own `challenges`/`check_in_events`/`playbook_entries`/`social_activity`/`activity_reactions` rows, including the narrow slice of `social_activity`/`activity_reactions` that a Kin's own feed currently references — letting those specific rows (and any reactions attached to them) disappear along with the account, rather than anonymizing them in place. This is not legal advice; the founder should confirm it against Apple's current published account-deletion guidance at submission time. On the evidence available, real deletion is the closer match to what Apple currently expects for UGC shared with other people, and it avoids building a whole anonymization/tombstone data model this codebase does not have today just to preserve cosmetic feed continuity for a remaining Kin. Anonymization remains available as Option 2 above if the founder decides otherwise, with its cost stated rather than hidden.

**Implementation consequence:** `challenges`/`check_in_events`/`playbook_entries`/`social_activity`/`activity_reactions` need an explicit, ordered delete path that resolves the full `on delete restrict` chain listed above before the `auth.users` row itself can be deleted. `social_activity`/`activity_reactions` are separately already `on delete cascade` from `auth.users` (see Kin relationships below); the explicit delete step is what makes the *timing* deliberate — done in the right order relative to the other gates in this document — not what makes those two tables' rows disappear, since cascade would do that anyway once `auth.users` is actually deleted.

---

## Kin relationships

**Question:** what happens to Kin edges, requests, blocks, and feed/activity records involving the deleted user?

**Constraints:** `kin_connections`, `social_activity`, and `activity_reactions` are already `on delete cascade` from `auth.users`, confirmed directly in the schema — meaning once the `auth.users` row is actually deleted, Postgres itself deletes these rows automatically, regardless of any status value set on them beforehand. An earlier draft of this document recommended transitioning `kin_connections` rows to `status='removed'` before deletion as a way to preserve them; that does not work as described — a plain status update on a row does not change whether a later `on delete cascade` fires when its foreign key target (`auth.users`) is deleted. Any option that wants to actually keep a Kin-visible trace of the relationship after account deletion needs real schema redesign, not a status change.

**Options:**
1. **Let the existing cascade do its job as-is**: `kin_connections`, `social_activity`, and `activity_reactions` rows involving the deleted user are removed automatically when the `auth.users` row is deleted. Requires no schema change, since it is already how the schema behaves today, and is consistent with the Completed history recommendation above.
2. **Build a real tombstone model**, if the founder wants a remaining Kin's feed to show something rather than nothing after a connection's owner is deleted. This is not a status transition — it requires actual schema work, for example a nullable/de-identified `owner_id` on the relevant tables, or moving the historical fact ("was Kin with someone, until this date") into a separate archival table that does not carry a live foreign key to `auth.users` at all. This is real, currently-undesigned engineering work, not a smaller variant of Option 1.

**Recommendation: Option 1**, consistent with the Completed history recommendation above — let the existing `on delete cascade` behavior remove `kin_connections`/`social_activity`/`activity_reactions` rows involving the deleted user. This also removes the earlier technical contradiction: no pre-deletion status transition is needed, because a status transition would not have survived the cascade anyway, and there is no product requirement here that Option 2's tombstone model would satisfy that simple deletion doesn't already cover.

**Implementation consequence:** no extra pre-deletion step is required for `kin_connections`/`social_activity`/`activity_reactions` beyond the ordinary sequencing already needed to resolve the `restrict`-chained tables first; letting the `auth.users` deletion's own cascade handle these three tables is sufficient under Option 1. If Option 2 (tombstone) is chosen instead, that is a distinct, not-yet-designed schema project and must not be assumed as a drop-in replacement for Option 1 or implemented as a mere status change.

---

## Recipient / organizer invitations

**Question:** what happens to outstanding invitation tokens, accepted organizer access, rotated tokens, and reward access after the owner's account is deleted?

**Constraints:** the recipient/organizer invitation model is intentionally accountless — a recipient or organizer never needs a Kinwin account to use their private link (`docs/PRODUCT_STATUS.md` §7). This is already gated by the Active challenge / Reward fulfillment blocks above: if those are enforced correctly, by the time deletion is allowed, every invitation on the account is already for a terminal, resolved challenge with no outstanding reward claim. There is also a schema constraint that a naive "just leave it" answer runs into: `invitations` and `challenge_reward_organizers` are `on delete restrict` beneath `challenges` (see the schema note at the top of this document), and Completed history above now recommends hard-deleting the `challenges` row itself. Postgres will refuse to delete a `challenges` row while a `restrict`-linked `invitations` row still references it — so the current schema cannot both hard-delete the challenge graph and leave live invitation rows in place unmodified. "Keep it as a historical record" has to mean something more deliberate than "just don't delete the row."

**Options:**
1. **Delete the live invitation rows along with the rest of the challenge graph** (token hash, acceptance status, everything), accepting the loss of even that de-identified trace once the account is deleted.
2. **Copy only the minimal fact needed for audit/dispute purposes into a separate, purpose-built private record before deleting the live rows** — for example, "an invitation for challenge X was accepted on date Y," with no live bearer-token hash and no display name, written to a structure that does not carry a live foreign key back to the challenge or the deleted user, so it survives their deletion without blocking it. This is conceptual only here — no such table exists, and the exact fields and retention period are not designed or decided in this document.
3. **Retain the live `invitations`/`challenge_reward_organizers` rows unmodified after account deletion.** Not viable as written: it directly conflicts with hard-deleting the challenge chain (Completed history above), since the `on delete restrict` foreign keys would block the `challenges` deletion from ever completing while these rows still exist.

**Recommendation: Option 2, narrowly**, and only for whatever specific fact turns out to be legally or operationally necessary (most likely: that an organizer accepted and a reward was fulfilled, for reconciliation purposes) — not a blanket "keep the invitation." A live bearer-token hash should not survive as a "historical record" once the account it belongs to is deleted; if any trace is kept, it should already be de-identified and audit-only, not a row that still functions as (or resembles) a live access credential. This is a smaller instance of the same decision as Payment/provider records below and should be made together with it, not separately.

**TEST-beta implementation note:** the founder chose **Option 1** for this pass, not the Option 2 recommended above — `invitations` (token hash included) and `challenge_reward_organizers` are hard-deleted along with the rest of the graph, with no minimal-record structure built. This matches the payment/provider-records decision below: real money isn't at stake yet, so no retained-record design was needed to ship this. Building the narrower Option 2 (or the equivalent under Payment/provider records below) remains a real, separate decision before production real-money launch.

**Implementation consequence:** invitation rows are included in the ordered delete path for the `challenges` chain (`private.delete_account_owned_data` deletes `invitations` before `consequences`/`challenge_reward_organizers`/`challenge_recipients`), not treated as an exception to it.

---

## Payment / provider records

**Question:** what is the technical minimum Kinwin needs to keep for Stripe/Tremendous reconciliation, refund/dispute handling, and accounting/audit, versus what can be deleted with the rest of the account?

**Constraints:** Stripe and Tremendous are the actual systems of record for the money that moved (or, currently, would move in TEST mode). Deleting Kinwin's own copies of `customer_reference`, `payment_method_reference`, `stripe_setup_intent_id`, `provider_reference` (the Stripe/Tremendous ids) would not delete anything at Stripe or Tremendous — it would only break Kinwin's own ability to reconcile against them if a dispute or accounting question comes up later. The same schema constraint noted under Recipient/organizer invitations above applies here directly: `private.consequence_provider_references`, `private.consequence_charge_attempts`, and `private.reward_fulfillments` are all `on delete restrict` beneath `consequences`/`challenges`, and Completed history above now recommends hard-deleting the `challenges` row itself. "Retain the minimal provider-reference data" therefore cannot mean leaving those exact live rows in place while also deleting `challenges` — Postgres would block the deletion. It has to mean copying the minimal needed fields somewhere that isn't FK-dependent on the row being deleted, before deleting it.

**Options:**
1. **Copy the minimal provider-reference and amount/status data (provider ids, amounts, status) into a separate, purpose-built private retained-record structure that does not carry a live foreign key back to `consequences`/`challenges`/the deleted user, before deleting the challenge/consequence graph.** Not the same as leaving `private.consequence_provider_references`/`consequence_charge_attempts`/`reward_fulfillments` in place as-is — those specific rows still get deleted along with the rest of the restrict-chained graph; only the minimal legally/operationally required fields (provider ids, amounts, status, not the user's display name, goal text, or check-in history) move into the new structure first.
2. **Delete provider references along with everything else**, accepting the loss of Kinwin-side reconciliation ability for that historical transaction.

**Recommendation (production, real money): Option 1**, scoped as narrowly as possible. **This is exactly the kind of retention period and record design that needs real legal/accounting advice, not an engineering guess** — no specific number of days/years is proposed here, and the "separate retained-record structure" is conceptual only: no such table exists, and it is explicitly not designed or built.

**TEST-beta implementation: Option 2.** The founder's explicit instruction for this pass: the current beta uses TEST Stripe/Tremendous rails only (no real money moves), so `private.consequence_provider_references`, `private.consequence_charge_attempts`, `private.consequence_setup_attempts`, `private.reward_fulfillments`, and `private.stripe_customers` are all hard-deleted along with the rest of the graph once every obligation is terminal — no retained-record structure was built. **This does not solve production retention** — before real money is at stake, Option 1 above (or an equivalent) needs a real decision, made with real legal/accounting advice, not assumed from this pass.

**Implementation consequence:** `private.delete_account_owned_data` is written as a sequence of clearly delineated per-table deletes specifically so a future "copy the minimal transaction record out, then delete the person and the rest of the challenge/consequence graph" step (Option 1) can be inserted before the consequence/invitation deletes without redesigning the function — but that step does not exist today. The exact boundary, field list, and retention length for production remain a founder/legal decision, not resolved by this pass.

---

## Supabase Auth user deletion

**Question:** what is the trusted server-side boundary for actually removing the `auth.users` row once everything above is resolved?

**Constraints:** deleting an `auth.users` row requires Supabase's service-role/admin credentials (`supabase.auth.admin.deleteUser()`), which must never reach client code, mobile or web — this is a hard, non-negotiable boundary already respected everywhere else in this codebase (every `service_role`-only operation lives in an Edge Function, never in the client bundle).

**Options — not really options, this is the only architecturally sound shape:**
- A single trusted Edge Function (e.g. `delete-account`), authenticated by the caller's own JWT (so it can only ever delete the caller's own account, the same pattern `create-consequence-setup-intent` and others already use), that: (1) re-validates every non-terminal-state gate above server-side (never trusts a client-side "I already checked" flag), (2) performs the ordered delete/anonymize steps for challenge/social/Playbook data, (3) calls the Supabase Admin API to delete the `auth.users` row last, only after every dependent row is resolved.

**Implementation consequence:** built as `supabase/functions/delete-account/index.ts`, following the same "thin Edge Function, pure orchestration logic in a testable `_shared` module" pattern already used throughout `supabase/functions/` — the actual trust boundary (re-checking eligibility, the ordered delete) lives in `private.delete_account_owned_data` (a `SECURITY DEFINER` Postgres function called via the service-role client with the caller's own verified JWT-derived id, never a client-supplied one), and the Edge Function itself only calls that RPC and then, once it succeeds, the Admin API.

---

## User experience

**Question:** what is the smallest acceptable in-app flow?

**Implemented as `app/account/delete-account.tsx`**, reached from a deliberately low-prominence "Delete account" link below Sign out in `app/account/index.tsx`:

1. **Account → Delete account** — a clearly-labeled, deliberately not-prominent entry point (matching how Sign out is already placed at the bottom of Account settings).
2. **Blocker explanation** — a server-backed preflight (`public.check_account_deletion_eligibility`, called directly — safe, read-only, `auth.uid()`-scoped) runs on load; if blocked, `lib/account-deletion.ts` maps the coarse reason token to specific copy (e.g. "Finish or cancel your current challenge before deleting your account") — never a raw database status name.
3. **Explicit confirmation** — a destructive confirmation sheet naming the consequence in plain language ("This permanently deletes your account and cannot be undone... Your challenge history, check-ins, Playbook entries, social activity, and Kin connections will all be deleted"), with a "Keep my account" default and a deliberate, specifically-labeled destructive action — never a bare Yes/No or an easily-accidental one-tap button.
4. **Terminal completion state** — a real "Your account has been deleted" screen (not a silent redirect) once `supabase/functions/delete-account` reports success; the user taps "Continue" to actually leave, which is when session invalidation and navigation happen — kept in-flow rather than racing the app's own signed-in route guard.
5. **Session invalidation** — `clearCreationSession`/`closeCreationSessionGeneration` purge the deleted user's local per-device creation-session snapshot, then `signOut('local')` clears the local Supabase session (a `'local'`-scope sign-out, since the account — and so the normal server-side revocation a default sign-out would call — no longer exists), before landing on Home signed out.

---

## Founder decisions — as made, and what is implemented

The five decisions this document originally raised, resolved by the founder and reflected in the implementation:

1. **Completed-history model: hard-delete.** Implemented — the deleting user's own `challenges`/`check_in_events`/`playbook_entries`/`social_activity`/`activity_reactions` rows (and the whole restrict-chained graph beneath `challenges`) are hard-deleted, not anonymized in place. No tombstone/anonymization model was built.
2. **Kin relationship handling: the existing `on delete cascade` behavior, as-is.** Implemented — no schema change to `kin_connections`/`social_activity`/`activity_reactions`; `private.delete_account_owned_data` deletes them explicitly (for a deterministic, verifiable result rather than relying purely on the later `auth.users` cascade), matching the schema's own existing cascade behavior. No tombstone/archival model was built.
3. **Minimal retained-record design and retention period for Stripe/Tremendous provider references: NOT built.** This is the one decision explicitly deferred, per the founder's own instruction for this pass: the current beta uses TEST-only Stripe/Tremendous rails, so every provider reference (`private.consequence_charge_attempts`, `private.consequence_provider_references`, `private.consequence_setup_attempts`, `private.reward_fulfillments`, `private.stripe_customers`) is hard-deleted along with the rest of the graph once every obligation is terminal. **This is explicitly not a production-ready answer** — before real money is at stake, a genuine, separate decision is still needed on what minimal accounting/reconciliation record (if any) must survive account deletion, its exact fields, and its retention period, made with real legal/accounting advice. `private.delete_account_owned_data` is structured as a sequence of clearly delineated per-table deletes specifically so a future "copy the minimal record out, then delete" step can be inserted before the consequence/invitation deletes without redesigning the function.
4. **"Block deletion during any non-terminal challenge/payment/reward state" is the final policy.** Implemented as a terminal-status *allow-list* (see the status note at the top of this document) — active, pending, and any future/unrecognized non-terminal state all block. No forced-early-failure alternative was built.
5. **Recipient/organizer display names are never retained after a deleted owner's challenge graph is removed.** Implemented — those names live only on `challenge_recipients`/`challenge_reward_organizers`/`invitations` rows, all deleted as part of the ordered graph delete; nothing copies them anywhere else.
