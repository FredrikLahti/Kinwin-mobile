import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { CheckInAppendPlan, CheckInAppendRequest, planCheckInAppend } from '@/domain/challenge/check-in/append-plan';
import { CheckInEvent, CheckInFact } from '@/domain/challenge/check-in/types';
import { CheckInId } from '@/domain/challenge/types';
import { buildEvent, nextOperationId } from '@/fixtures/challenge-ux-preview/builders';
import { CHALLENGE_UX_SCENARIOS, ChallengeUxScenario, findScenario } from '@/fixtures/challenge-ux-preview/scenarios';
import { ActiveChallengeViewModel, buildActiveChallengeViewModel } from '@/lib/challenge-ux-preview/view-model';

/**
 * Session-only state for the /challenge-ux-preview prototype. A scenario's
 * own fixture events seed the session; every submission after that goes
 * through the real `planCheckInAppend` contract (the same idempotency +
 * reporting-window gate a trusted write endpoint would use) before an event
 * is appended — this never invents its own accept/reject logic. Reloading
 * (or switching scenarios) honestly resets to the fixture; nothing here
 * resembles production persistence.
 */
type ChallengeUxPreviewContextValue = {
  readonly scenario: ChallengeUxScenario;
  readonly viewModel: ActiveChallengeViewModel;
  readonly selectScenario: (id: string) => void;
  readonly resetScenario: () => void;
  readonly submit: (fact: CheckInFact, correctionOfEventId?: CheckInId) => CheckInAppendPlan;
};

const ChallengeUxPreviewContext = createContext<ChallengeUxPreviewContextValue | null>(null);

export function ChallengeUxPreviewProvider({ children }: { children: ReactNode }) {
  const [scenarioId, setScenarioId] = useState<string>(CHALLENGE_UX_SCENARIOS[0].id);
  const scenario = findScenario(scenarioId);
  const [events, setEvents] = useState<readonly CheckInEvent[]>(scenario.events);

  const viewModel = useMemo(
    () => buildActiveChallengeViewModel({ challenge: scenario.challenge, periods: scenario.periods, events, now: scenario.now }),
    [scenario, events],
  );

  const value = useMemo<ChallengeUxPreviewContextValue>(() => ({
    scenario,
    viewModel,
    selectScenario: (id: string) => {
      setScenarioId(id);
      setEvents(findScenario(id).events);
    },
    resetScenario: () => setEvents(scenario.events),
    submit: (fact: CheckInFact, correctionOfEventId?: CheckInId): CheckInAppendPlan => {
      const period = scenario.periods.find((p) => p.id === viewModel.focusPeriodId);
      if (!period) return { kind: 'rejected', reason: 'malformed_existing_history' };
      const existingEventsForPeriod = events.filter((e) => e.periodId === period.id);
      const request: CheckInAppendRequest = {
        operationId: nextOperationId(),
        challengeId: scenario.challenge.id,
        ownerId: scenario.challenge.ownerId,
        periodId: period.id,
        fact,
        isCorrection: correctionOfEventId !== undefined,
        correctionOfEventId,
        source: 'ios',
        clientRecordedAt: scenario.now,
      };
      const plan = planCheckInAppend(request, existingEventsForPeriod, null, { now: scenario.now, period });
      if (plan.kind === 'insert') {
        const newEvent = buildEvent({
          periodId: period.id,
          eventType: plan.eventType,
          fact,
          correctionOfEventId,
          clientRecordedAt: scenario.now,
        });
        setEvents((prev) => [...prev, newEvent]);
      }
      return plan;
    },
  }), [scenario, viewModel, events]);

  return <ChallengeUxPreviewContext.Provider value={value}>{children}</ChallengeUxPreviewContext.Provider>;
}

export function useChallengeUxPreview() {
  const context = useContext(ChallengeUxPreviewContext);
  if (!context) throw new Error('useChallengeUxPreview must be used within ChallengeUxPreviewProvider');
  return context;
}
