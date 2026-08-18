import { useRouter } from 'expo-router';
import { Keyboard } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { BehaviorDirection, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';

const TYPES: { description: string; label: string; value: BehaviorDirection }[] = [
  { description: 'Do something consistently, like training or reading.', label: 'Build', value: 'build' },
  { description: 'Keep something under a limit, like takeaways or screen time.', label: 'Limit', value: 'cut' },
  { description: 'Keep something at zero, like nicotine or gambling.', label: 'Avoid', value: 'stop' },
];

const NEXT_SCREEN: Record<BehaviorDirection, string> = {
  build: '/create/build',
  cut: '/create/limit',
  stop: '/create/avoid',
};

export default function CreateTypeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { behaviorDirection, setBehaviorDirection } = useOnboarding();
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'type');

  const canContinue = Boolean(behaviorDirection);

  const continueToRule = () => {
    if (!behaviorDirection) return;
    Keyboard.dismiss();
    router.push(NEXT_SCREEN[behaviorDirection] as never);
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to your goal"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to define your challenge' : 'Choose a challenge type before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToRule}
          reducedMotion={reducedMotion}
        />
      }
      headline="What kind of challenge is this?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: challenge type`}
      totalSteps={totalSteps}
    >
      <ChoiceListV2 onChange={setBehaviorDirection} options={TYPES} value={behaviorDirection} />
    </CreateFlowScreenV2>
  );
}
