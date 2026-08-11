import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenOrganizerReward, describeOwnerRewardStatus, recipientRoleLabel, rewardLinkErrorMessage } from './reward-journey';

test('owner reward states stay product-facing and truthful', () => {
  const states = ['waiting_for_organizer','preparing','ready','needs_attention'] as const;
  const copy = states.map((state) => describeOwnerRewardStatus({ state, organizerName: 'Alex', organizerIsRecipient: false }));
  assert.match(copy[0].label,/Waiting for Alex/); assert.match(copy[1].label,/Preparing/); assert.equal(copy[2].label,'Reward ready'); assert.match(copy[3].label,/needs attention/);
  const serialized=JSON.stringify(copy).toLowerCase();
  for(const forbidden of ['tremendous','provider_created','terminal_failure','reconciliation','paymentintent','redeemed','used']) assert.equal(serialized.includes(forbidden),false);
});

test('only an accepted ready organizer can open the reward', () => {
  assert.equal(canOpenOrganizerReward({accessRole:'organizer',invitationStatus:'accepted',rewardStatus:'ready'}),true);
  assert.equal(canOpenOrganizerReward({accessRole:'organizer',invitationStatus:'sent',rewardStatus:'ready'}),false);
  assert.equal(canOpenOrganizerReward({accessRole:'organizer',invitationStatus:'accepted',rewardStatus:'processing'}),false);
  assert.equal(canOpenOrganizerReward({accessRole:'recipient',invitationStatus:'accepted',rewardStatus:'ready'}),false);
});

test('combined recipient organizer role is presented once and cooldown is calm', () => {
  assert.equal(recipientRoleLabel('organizer','Anna'),'RECIPIENT AND REWARD ORGANIZER');
  assert.match(rewardLinkErrorMessage('cooldown'),/already opening/);
});
