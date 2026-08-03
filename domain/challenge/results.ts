import { ActivatedChallengeSnapshot, IsoDateTime } from './types';
import { ChallengePeriod, CheckInEvent } from './periods';

export type ChallengeResultStatus = 'pending' | 'on_track' | 'at_risk' | 'success' | 'failure';
export type NotEvaluableReason =
  | 'periods_not_generated'
  | 'periods_not_closed'
  | 'events_awaiting_server_timestamp'
  | 'cut_back_continuity_policy_unresolved'
  | 'correction_policy_unresolved'
  | 'rule_evaluation_not_implemented'
  | 'unsupported_rule_version';

export type ChallengeEvaluation =
  | { readonly evaluable: true; readonly status: ChallengeResultStatus; readonly evaluatedAt: IsoDateTime; readonly ruleEngineVersion: 1 }
  | { readonly evaluable: false; readonly status: 'pending'; readonly reasons: readonly NotEvaluableReason[]; readonly ruleEngineVersion: 1 };

export type ChallengeEvaluationInput = {
  readonly challenge: ActivatedChallengeSnapshot;
  readonly periods: readonly ChallengePeriod[];
  readonly events: readonly CheckInEvent[];
  readonly evaluatedAt: IsoDateTime;
};

/**
 * Conservative deterministic boundary. It refuses final evaluation until trusted, closed
 * periods exist; a server evaluator can then implement the versioned rule algorithms.
 */
export function evaluateChallenge(input: ChallengeEvaluationInput): ChallengeEvaluation {
  const reasons: NotEvaluableReason[] = [];
  if (input.challenge.ruleEngineVersion !== 1 || input.challenge.successRule.ruleVersion !== 1) reasons.push('unsupported_rule_version');
  if (input.periods.length === 0) reasons.push('periods_not_generated');
  if (input.periods.some((period) => !period.isClosed)) reasons.push('periods_not_closed');
  if (input.events.some((event) => event.serverRecordedAt === null)) reasons.push('events_awaiting_server_timestamp');
  if (input.events.some((event) => event.correctsEventId !== undefined)) reasons.push('correction_policy_unresolved');
  if (input.challenge.successRule.direction === 'cut_back') reasons.push('cut_back_continuity_policy_unresolved');
  // Period statuses alone cannot safely decide aggregate and continuity rules yet.
  reasons.push('rule_evaluation_not_implemented');
  return { evaluable: false, status: 'pending', reasons: [...new Set(reasons)], ruleEngineVersion: 1 };
}
