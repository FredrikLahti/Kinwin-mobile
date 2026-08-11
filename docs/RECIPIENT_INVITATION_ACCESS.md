# Recipient invitation access

Kinwin uses a durable, scoped bearer link for each locked challenge recipient. The
server generates 32 cryptographically random bytes and returns the raw base64url token
only to the authenticated challenge owner. `public.invitations` stores only its SHA-256
hash. Asking to share again rotates the token and invalidates the older link while
preserving an accepted or declined response.

The public route sends the token to `recipient-invitation`. That trusted Edge Function
looks up the hash with service credentials and returns exactly: invitation status, owner
display name, recipient display name, goal, behavior description, consequence category,
and the owner's sit-out promise. It does not return IDs, stake, check-ins, other
recipients, payment details, Playbook content, social activity, or Kin connections.
Anonymous roles retain no direct table grants.

Accept and decline are idempotent for the same response. A conflicting later response is
rejected. Acceptance does not create a Kin relationship and never gates activation. No
recipient email address, phone number, or Kinwin account is required. The bearer link
remains useful after acceptance so a future server-side Tremendous LINK integration can
expose only that recipient's reward through the same boundary.

Every prepared challenge also has one immutable `challenge_reward_organizers` row.
When the organizer is a recipient it links to that recipient and reuses the same
invitation. When the organizer is another trusted person it remains separate from the
beneficiaries and receives an organizer-scoped invitation through the same token
architecture.

`private.accepted_reward_organizer_targets` gives a future service-role worker a
deterministic join from accepted organizer access to canonical organizer, challenge,
and consequence. It contains no reward link and does not change fulfillment semantics.

Kinwin v1 creates one full-value reward obligation for each successfully charged failed
challenge. It never splits the stake or creates one reward per recipient. The canonical
organizer coordinates one shared reward or experience for the immutable recipient group,
and the owner sits out. Tremendous remains sandbox-only until operational review,
credential provisioning, provider-evidence review, and lost-link recovery are complete.
