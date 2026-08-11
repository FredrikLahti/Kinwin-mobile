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

`private.accepted_recipient_delivery_targets` gives a future service-role worker a
deterministic join from accepted invitation to challenge recipient, challenge, and
consequence. It contains no reward link and does not change fulfillment semantics.

Before Tremendous can be implemented, product must decide how one stake is allocated
when a challenge has multiple recipients. Recipient organizer responsibilities and lost
link recovery without recipient PII also require an explicit decision. This package does
not invent either rule.
