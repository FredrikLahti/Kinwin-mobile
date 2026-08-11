import assert from 'node:assert/strict';import test from 'node:test';import {extractRecipientInvitationToken} from './deep-link';
const token='A'.repeat(43);
test('invitation token extraction is stable for universal and custom links',()=>{assert.equal(extractRecipientInvitationToken(`https://beta.example/invite/${token}`),token);assert.equal(extractRecipientInvitationToken(`kinwin://invite/${token}`),token);});
test('invitation extraction rejects malformed, nested and tokenless links',()=>{assert.equal(extractRecipientInvitationToken('https://beta.example/invite'),null);assert.equal(extractRecipientInvitationToken(`https://beta.example/x/invite/${token}`),null);assert.equal(extractRecipientInvitationToken('not a url'),null);});
