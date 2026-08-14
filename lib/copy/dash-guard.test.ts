import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { findBannedDashes } from './dash-guard';

// __dirname at runtime is the compiled .test-dist/lib/copy/ directory
// (tsconfig.test.json's outDir mirrors the source tree), so three levels up
// reaches the real repo root where app/ and components/ actually live —
// this test scans real source files, not the compiled output.
const ROOT = join(__dirname, '..', '..', '..');

// Scoped to the real, currently reachable product UI — not the internal
// prototypes under app/social-preview, app/social-onboarding-preview,
// app/challenge-ux-preview, or the orphaned legacy app/challenge shell,
// which are explicitly out of scope for this rule.
const SCAN_DIRS = [
  'app/create',
  'app/account',
  'app/home',
  'app/auth',
  'app/invite',
  'app/legal',
  'components/v2',
  'components/onboarding',
  'components/share',
];
const SCAN_FILES = ['app/index.tsx', 'app/_layout.tsx'];

function collectSourceFiles(relativeDir: string): string[] {
  const absoluteDir = join(ROOT, relativeDir);
  const entries = readdirSync(absoluteDir);
  return entries.flatMap((entry) => {
    const full = join(absoluteDir, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(join(relativeDir, entry));
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

test('user-facing copy in the real product UI never uses em dash, en dash, double hyphen, or a spaced hyphen as a sentence separator', () => {
  const files = [
    ...SCAN_DIRS.flatMap(collectSourceFiles),
    ...SCAN_FILES.map((file) => join(ROOT, file)),
  ];
  const failures: string[] = [];
  for (const file of files) {
    const violations = findBannedDashes(readFileSync(file, 'utf8'));
    for (const violation of violations) {
      failures.push(`${file.slice(ROOT.length + 1)}:${violation.line} (${violation.label}): ${violation.text}`);
    }
  }
  assert.equal(failures.length, 0, `Prohibited dash punctuation found:\n${failures.join('\n')}`);
});
