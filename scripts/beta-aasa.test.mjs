import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAasaDocument, EXPECTED_BUNDLE_ID } from './beta-aasa.cjs';

test('rejects missing or malformed Apple Team ID', () => {
  assert.throws(() => buildAasaDocument(undefined));
  assert.throws(() => buildAasaDocument(''));
  assert.throws(() => buildAasaDocument('short'));
  assert.throws(() => buildAasaDocument('lowercase1'));
  assert.throws(() => buildAasaDocument('TOOLONGTEAMID'));
});

test('rejects obvious placeholder team ids', () => {
  assert.throws(() => buildAasaDocument('0000000000'));
  assert.throws(() => buildAasaDocument('XXXXXXXXXX'));
  assert.throws(() => buildAasaDocument('TEAMID1234'));
  assert.throws(() => buildAasaDocument('SAMPLEID12'));
});

test('builds a scoped AASA document for a real team id', () => {
  const doc = buildAasaDocument('A1B2C3D4E5');
  assert.deepEqual(doc.applinks.details[0].appIDs, [`A1B2C3D4E5.${EXPECTED_BUNDLE_ID}`]);
  assert.deepEqual(doc.applinks.details[0].components, [{ '/': '/invite/*' }]);
});

test('AASA content never embeds a token, query, or fragment value', () => {
  const doc = buildAasaDocument('A1B2C3D4E5');
  const serialized = JSON.stringify(doc);
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('?'), false);
  assert.equal(serialized.includes('#'), false);
});

test('the association scope is exactly one path, never the whole domain', () => {
  const doc = buildAasaDocument('A1B2C3D4E5');
  assert.equal(doc.applinks.details.length, 1);
  assert.equal(doc.applinks.details[0].components.length, 1);
});
