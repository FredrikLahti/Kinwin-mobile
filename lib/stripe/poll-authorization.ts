/**
 * Bounded verification polling for the window between PaymentSheet reporting
 * a successful card step and the webhook-authoritative server state catching
 * up. Never unbounded: a fixed, short schedule (summing to ~15-20s) that
 * stops the moment `check` reports authorized, the schedule runs out, or
 * `signal` is already aborted — the caller aborts it on unmount or on
 * losing screen focus, so no timer or request ever outlives the screen that
 * started it.
 */
export const DEFAULT_POLL_DELAYS_MS: readonly number[] = [2000, 3000, 3000, 4000, 5000];

export type AuthorizationCheckResult = { readonly authorized: boolean };
export type AuthorizationPollOutcome = 'authorized' | 'timeout' | 'aborted';
export type AbortSignalLike = { readonly aborted: boolean };

export async function pollForAuthorization(
  check: () => Promise<AuthorizationCheckResult>,
  options: {
    readonly signal: AbortSignalLike;
    readonly delaysMs?: readonly number[];
    readonly wait?: (ms: number) => Promise<void>;
  },
): Promise<AuthorizationPollOutcome> {
  const delays = options.delaysMs ?? DEFAULT_POLL_DELAYS_MS;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (options.signal.aborted) return 'aborted';

    const result = await check();
    if (result.authorized) return 'authorized';
    if (options.signal.aborted) return 'aborted';

    if (attempt === delays.length) return 'timeout';
    await wait(delays[attempt]);
  }
  return 'timeout';
}
