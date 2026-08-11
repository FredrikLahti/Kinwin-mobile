import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecipientToken, hashRecipientToken, isRecipientTokenShape } from './token';

test('recipient tokens are opaque 256 bit values and only their hash is durable', async () => {
  const token = createRecipientToken((bytes) => { bytes.fill(17); return bytes; });
  const hash = await hashRecipientToken(token);
  assert.equal(isRecipientTokenShape(token), true);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.doesNotMatch(hash, new RegExp(token));
});

test('random and malformed values fail before database lookup', () => {
  assert.equal(isRecipientTokenShape('invitation-id'), false);
  assert.equal(isRecipientTokenShape(''), false);
});
