export type DueChallenge = {
  readonly challengeId: string;
  readonly ownerId: string;
  readonly previousStatus: 'active' | 'completion_mode' | 'awaiting_resolution';
};

export type WorkerCounts = {
  readonly eligible: number;
  readonly reconciled: number;
  readonly finalizedSuccess: number;
  readonly finalizedFailure: number;
  readonly failed: number;
};

export type CompletionWorkerDependencies = {
  readonly start: () => Promise<
    | { readonly status: 'already_running'; readonly runId: string | null }
    | { readonly status: 'started'; readonly runId: string; readonly leaseToken: string }
  >;
  readonly claimDue: () => Promise<readonly DueChallenge[]>;
  readonly finalize: (challenge: DueChallenge) => Promise<
    | { readonly kind: 'terminal'; readonly status: 'completed_success' | 'completed_failure' }
    | { readonly kind: 'pending'; readonly reasons: readonly string[] }
  >;
  readonly recordFailure: (runId: string, leaseToken: string, challengeId: string, errorCode: string) => Promise<void>;
  readonly finish: (
    runId: string,
    leaseToken: string,
    status: 'succeeded' | 'partial_failure' | 'failed',
    counts: WorkerCounts,
    errorCode?: string,
  ) => Promise<void>;
};

export type CompletionWorkerResult =
  | { readonly status: 'already_running'; readonly runId: string | null }
  | ({ readonly status: 'succeeded' | 'partial_failure' } & WorkerCounts & { readonly runId: string });

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 120);
  }
  return 'unexpected_challenge_error';
}

/** Batch orchestration only. Database RPCs own eligibility, leases and writes. */
export async function runScheduledChallengeCompletion(
  dependencies: CompletionWorkerDependencies,
): Promise<CompletionWorkerResult> {
  const started = await dependencies.start();
  if (started.status === 'already_running') return started;

  let counts: WorkerCounts = {
    eligible: 0,
    reconciled: 0,
    finalizedSuccess: 0,
    finalizedFailure: 0,
    failed: 0,
  };

  try {
    const challenges = await dependencies.claimDue();
    counts = {
      ...counts,
      eligible: challenges.length,
      reconciled: challenges.filter((challenge) => challenge.previousStatus !== 'awaiting_resolution').length,
    };

    for (const challenge of challenges) {
      try {
        const result = await dependencies.finalize(challenge);
        if (result.kind === 'pending') {
          throw { code: `not_evaluable_${result.reasons[0] ?? 'unknown'}` };
        }
        counts = result.status === 'completed_success'
          ? { ...counts, finalizedSuccess: counts.finalizedSuccess + 1 }
          : { ...counts, finalizedFailure: counts.finalizedFailure + 1 };
      } catch (error) {
        counts = { ...counts, failed: counts.failed + 1 };
        await dependencies.recordFailure(started.runId, started.leaseToken, challenge.challengeId, safeErrorCode(error));
      }
    }

    const status = counts.failed === 0 ? 'succeeded' : 'partial_failure';
    await dependencies.finish(started.runId, started.leaseToken, status, counts);
    return { status, runId: started.runId, ...counts };
  } catch (error) {
    await dependencies.finish(started.runId, started.leaseToken, 'failed', counts, safeErrorCode(error));
    throw error;
  }
}
