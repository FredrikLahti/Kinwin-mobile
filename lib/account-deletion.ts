/**
 * Maps public.check_account_deletion_eligibility's coarse reason token to
 * real, specific copy — never a raw database status name. See
 * supabase/migrations/20260903000000_account_deletion.sql's
 * private.account_deletion_blocker for exactly what each token means.
 */
export function describeAccountDeletionBlocker(reason: string): string {
  switch (reason) {
    case 'active_challenge':
      return 'Finish or cancel your current challenge before deleting your account.';
    case 'payment_recovery_pending':
      return 'A payment from a failed challenge still needs to be resolved before you can delete your account.';
    case 'reward_fulfillment_pending':
      return 'A reward from a failed challenge still needs to be delivered before you can delete your account.';
    default:
      return 'Your account can’t be deleted right now. Try again later, or contact support if this continues.';
  }
}
