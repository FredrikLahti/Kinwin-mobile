import { SubmitCheckInResult } from './supabase/active-challenge-repository';

/**
 * Plain, user-facing copy for a failed correction submission — never a raw
 * database/domain identifier (`correction_target_mismatch`,
 * `operation_id_conflict`, …) reaches the screen. `retryable` distinguishes
 * "tap Save correction again might work" (a transport hiccup, or a genuine
 * idempotency collision worth retrying) from "retrying this exact request
 * can never succeed" (the window closed, the target went stale, the
 * challenge is no longer active) — the correction sheet uses it to decide
 * whether to offer a same-attempt retry or just a close button.
 */
export type CorrectionFailureCopy = { readonly message: string; readonly retryable: boolean };

export function describeCorrectionFailure(result: Exclude<SubmitCheckInResult, { readonly ok: true }>): CorrectionFailureCopy {
  if (result.kind === 'rejected') return describeCorrectionRejectionReason(result.reason);
  if (result.kind === 'invalid_state') return { message: "This challenge is no longer active, so it can't be corrected.", retryable: false };
  if (result.kind === 'not_configured') return { message: 'Kinwin is not available right now.', retryable: false };
  // network | unknown — the repository's own message is already plain copy.
  return { message: result.message, retryable: true };
}

function describeCorrectionRejectionReason(reason: string): CorrectionFailureCopy {
  switch (reason) {
    case 'reporting_deadline_passed':
      return { message: 'The reporting window for this period has closed.', retryable: false };
    case 'correction_target_mismatch':
      return { message: 'This report has changed since you opened this screen.', retryable: false };
    case 'correction_without_prior_entry':
      return { message: 'There is nothing to correct for this period anymore.', retryable: false };
    case 'operation_id_conflict':
      // Not retryable *within this attempt*: the correction sheet reuses
      // the exact same operationId (and the exact same attemptedFact) on
      // every "Try again" tap — see real-check-in-correction-sheet.tsx's
      // own header comment — so retrying here would resubmit the identical
      // request and hit the identical, permanent conflict every time. Only
      // closing this sheet and reopening it mints a fresh operationId (a
      // genuinely new logical attempt), which is the only thing that can
      // actually resolve this.
      return { message: "This correction couldn't be safely retried. Close this screen and try again.", retryable: false };
    default:
      return { message: 'This correction could not be saved.', retryable: false };
  }
}
