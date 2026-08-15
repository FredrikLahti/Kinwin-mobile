import { CreationSessionFields, planBackLeaveAttempt } from './creation-session';

/**
 * React Navigation's `beforeRemove` event fires for *every* way the
 * current screen can be removed from its stack — not just the user
 * actually going back. An intentional `router.replace(...)` (Save & exit
 * → Home, a successful server conversion → Share, a pending-commitment
 * redirect, ...) removes the screen exactly the same way a real Back
 * does, so it must never be intercepted as if it were one.
 *
 * These are the action types React Navigation itself dispatches for a
 * genuine Back: `GO_BACK` (expo-router's router.back()/goBack()), and
 * `POP`/`POP_TO_TOP`/`POP_TO` (native-stack's own gesture and hardware-
 * back handlers — see @react-navigation/native-stack's
 * NativeStackView.native.js onDismissed/onHeaderBackButtonClicked, and
 * @react-navigation/native's useBackButton.native.js, which both dispatch
 * StackActions.pop()/CommonActions.goBack()). `REPLACE`, `NAVIGATE`, and
 * `PUSH` are never Back. Classifying by the action's own type — not by
 * destination route strings — is what makes this reliable regardless of
 * where the intentional transition happens to be going.
 */
const BACK_LIKE_ACTION_TYPES = new Set(['GO_BACK', 'POP', 'POP_TO_TOP', 'POP_TO']);

export function isBackLikeNavigationAction(action: { readonly type: string }): boolean {
  return BACK_LIKE_ACTION_TYPES.has(action.type);
}

export type CreationRemovalDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'redirect'; readonly route: string }
  | { readonly kind: 'confirm_leave_without_saving' };

/**
 * The complete, pure decision behind components/v2/create-flow-screen.tsx's
 * `beforeRemove` handler — extracted so every branch can be proven without
 * mounting React Navigation. Order matters:
 *
 * 1. Not a back-like action at all (an intentional programmatic
 *    transition) → always allow, before anything else is even considered.
 * 2. navigationLocked (Review mid server-conversion) → block a genuine
 *    Back, but only ever a back-like one; an intentional transition
 *    already returned 'allow' above and is never affected by the lock.
 * 3. A logical previous creation route exists and the native stack has no
 *    real prior /create/* entry to pop to (a session resumed mid-flow) →
 *    redirect there instead of letting the pop go wherever the shallow
 *    stack would actually send it.
 * 4. Otherwise this is the one genuine creation → Home boundary (Goal) —
 *    confirm only if there is unsaved work relative to the checkpoint.
 */
export function classifyCreationRemovalAction(params: {
  readonly action: { readonly type: string };
  readonly checkpointFields: CreationSessionFields | null;
  readonly currentFields: CreationSessionFields;
  readonly nativeStackHasPreviousEntry: boolean;
  readonly navigationLocked: boolean;
  readonly previousCreationRoute: string | null;
}): CreationRemovalDecision {
  if (!isBackLikeNavigationAction(params.action)) return { kind: 'allow' };
  if (params.navigationLocked) return { kind: 'blocked' };
  if (params.previousCreationRoute !== null) {
    if (params.nativeStackHasPreviousEntry) return { kind: 'allow' };
    return { kind: 'redirect', route: params.previousCreationRoute };
  }
  if (planBackLeaveAttempt(params.currentFields, params.checkpointFields) === 'confirm_leave_without_saving') {
    return { kind: 'confirm_leave_without_saving' };
  }
  return { kind: 'allow' };
}
