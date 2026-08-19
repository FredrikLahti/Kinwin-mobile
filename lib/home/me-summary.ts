/**
 * fetchChallengeHistorySummary (lib/supabase/playbook-repository.ts) returns
 * `completed` as the count of ALL resolved challenges — completed_success
 * AND completed_failure together — with `failed` as the subset of those
 * that failed. Presenting it as "N completed, M that taught you something"
 * (the old Me copy) double-counts: a user with 7 resolved challenges, 2 of
 * them failed, would read that as 7 successes plus 2 more failures — 9
 * challenges, not 7. This derives the real, non-overlapping breakdown and
 * states it factually. A failed challenge is allowed to simply be a failed
 * challenge — no euphemism, no therapeutic framing.
 */
export function describeChallengeHistory(summary: { readonly completed: number; readonly failed: number }): string | null {
  const { completed, failed } = summary;
  if (completed <= 0) return null;
  const succeeded = completed - failed;
  if (failed <= 0) return `${completed} challenge${completed === 1 ? '' : 's'} completed.`;
  if (succeeded <= 0) return `${failed} challenge${failed === 1 ? '' : 's'} failed.`;
  return `${succeeded} succeeded · ${failed} failed.`;
}
