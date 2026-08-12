#!/usr/bin/env node
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { buildAasaDocument } = require('./beta-aasa.cjs');

async function main() {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error('Usage: node scripts/generate-beta-aasa.cjs <web-output-dir>');
    process.exitCode = 1;
    return;
  }
  const document = buildAasaDocument(process.env.KINWIN_APPLE_TEAM_ID);
  const wellKnownDir = path.join(outputDir, '.well-known');
  await mkdir(wellKnownDir, { recursive: true });
  const target = path.join(wellKnownDir, 'apple-app-site-association');
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${target}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
