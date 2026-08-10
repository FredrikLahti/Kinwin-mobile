// Authenticated fast-path for challenge completion. The scheduled worker is
// authoritative for eventual completion; this user-scoped endpoint remains
// as defense in depth and for faster convergence when the owner opens Kinwin.
import { withSupabase } from 'npm:@supabase/server@^1';

import {
  ChallengeCompletionError,
  finalizePersistedChallenge,
} from '../_shared/challenge-completion/finalize.ts';

type RequestBody = { readonly challengeId?: unknown };

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

function completionErrorResponse(error: ChallengeCompletionError): Response {
  if (error.code === 'challenge_not_found') return jsonError(404, 'not_found', 'challenge not found');
  if (error.code === 'invalid_state') return jsonError(400, 'invalid_state', error.message);
  console.error('finalize-challenge:', error.code);
  return jsonError(500, 'internal_error');
}

export default {
  fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_request', 'expected a JSON body');
    }

    const challengeId = typeof body.challengeId === 'string' && body.challengeId.length > 0 ? body.challengeId : null;
    if (!challengeId) return jsonError(400, 'invalid_request', 'challengeId is required');

    const ownerId = ctx.userClaims?.id;
    if (!ownerId) return jsonError(401, 'unauthorized');

    try {
      const result = await finalizePersistedChallenge(ctx.supabaseAdmin, challengeId, ownerId);
      if (result.kind === 'pending') {
        return Response.json({ status: 'pending', evaluable: false, reasons: result.reasons });
      }
      return Response.json({
        status: result.status,
        evaluable: true,
        alreadyFinalized: !result.changed,
      });
    } catch (error) {
      if (error instanceof ChallengeCompletionError) return completionErrorResponse(error);
      console.error('finalize-challenge: unexpected error');
      return jsonError(500, 'internal_error');
    }
  }),
};
