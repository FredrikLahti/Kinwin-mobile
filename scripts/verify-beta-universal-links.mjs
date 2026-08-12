#!/usr/bin/env node
// Read-only verifier for the deployed beta Universal Link contract. Never mutates
// anything, never persists a token, and never prints an invitation token or secret.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseInvitationOrigin } = require('./beta-invitation-origin.cjs');
const { buildAasaDocument } = require('./beta-aasa.cjs');

const PROBE_PATH = '/invite/kinwin-universal-link-verification-probe';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

async function fetchNoRedirect(url) {
  return fetch(url, { redirect: 'manual', headers: { accept: 'application/json,text/html' } });
}

async function main() {
  const rawOrigin = process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL;
  const teamId = process.env.KINWIN_APPLE_TEAM_ID;

  let host;
  try {
    ({ host } = parseInvitationOrigin(rawOrigin));
    pass(`invitation origin is a scoped HTTPS host (${host})`);
  } catch (error) {
    fail(`invitation origin invalid: ${error.message}`);
    return;
  }

  let expectedAasa;
  try {
    expectedAasa = buildAasaDocument(teamId);
    pass('KINWIN_APPLE_TEAM_ID is a real, non-placeholder Apple Team ID');
  } catch (error) {
    fail(error.message);
    return;
  }

  const aasaUrl = `https://${host}/.well-known/apple-app-site-association`;
  let aasaResponse;
  try {
    aasaResponse = await fetchNoRedirect(aasaUrl);
  } catch (error) {
    fail(`could not reach ${aasaUrl}: ${error.message}`);
    return;
  }
  if (aasaResponse.status >= 300 && aasaResponse.status < 400) {
    fail(`${aasaUrl} redirected (status ${aasaResponse.status}); AASA must be served directly with no redirect`);
  } else if (aasaResponse.status !== 200) {
    fail(`${aasaUrl} returned status ${aasaResponse.status}, expected 200`);
  } else {
    let body;
    try {
      body = await aasaResponse.json();
    } catch {
      fail('AASA response body is not valid JSON');
      body = null;
    }
    if (body) {
      const actualAppIds = body?.applinks?.details?.[0]?.appIDs ?? [];
      const actualComponents = body?.applinks?.details?.[0]?.components ?? [];
      const expectedAppIds = expectedAasa.applinks.details[0].appIDs;
      const expectedComponents = expectedAasa.applinks.details[0].components;
      if (JSON.stringify(actualAppIds) !== JSON.stringify(expectedAppIds)) {
        fail(`deployed AASA appIDs do not match the expected Team ID + bundle identifier`);
      } else {
        pass('deployed AASA declares the expected app ID');
      }
      if (JSON.stringify(actualComponents) !== JSON.stringify(expectedComponents)) {
        fail(`deployed AASA is not scoped to exactly /invite/*`);
      } else {
        pass('deployed AASA is scoped to exactly /invite/*');
      }
      if (body.applinks.details.length !== 1) {
        fail('deployed AASA declares more than one app association; expected exactly one');
      }
    }
  }

  const probeUrl = `https://${host}${PROBE_PATH}`;
  let probeResponse;
  try {
    probeResponse = await fetchNoRedirect(probeUrl);
  } catch (error) {
    fail(`could not reach ${probeUrl}: ${error.message}`);
    return;
  }
  if (probeResponse.status >= 300 && probeResponse.status < 400) {
    fail(`${PROBE_PATH} redirected (status ${probeResponse.status}); the host rewrite must serve the web app directly, not redirect`);
  } else if (probeResponse.status !== 200) {
    fail(`${PROBE_PATH} returned status ${probeResponse.status}; the static host is not rewriting /invite/* to the web app`);
  } else {
    pass('the beta host serves the web app directly under /invite/* (accountless fallback works)');
  }

  if (process.exitCode) {
    console.error('\nBeta Universal Link verification FAILED. See FAIL lines above.');
  } else {
    console.log('\nBeta Universal Link verification passed.');
  }
}

main().catch((error) => {
  console.error(`Unexpected verifier error: ${error.message}`);
  process.exitCode = 1;
});
