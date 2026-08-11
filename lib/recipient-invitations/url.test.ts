import assert from 'node:assert/strict'; import test from 'node:test';
import { buildRecipientInvitationUrl } from './url';
const TOKEN = 'A'.repeat(43);
test('public invitation URL requires configured HTTPS origin', () => { assert.equal(buildRecipientInvitationUrl(undefined, TOKEN), null); assert.equal(buildRecipientInvitationUrl('http://localhost:8081', TOKEN), null); assert.equal(buildRecipientInvitationUrl('https://kinwin.example/', TOKEN), `https://kinwin.example/invite/${TOKEN}`); });
test('UUIDs and malformed values cannot become bearer links', () => assert.equal(buildRecipientInvitationUrl('https://kinwin.example', '00000000-0000-0000-0000-000000000000'), null));
