// Automated guard against this directory silently diverging from its
// source of truth (domain/challenge/check-in/* and
// domain/challenge/{types,periods}.ts). Every file here exists only because
// Deno requires explicit `.ts` extensions on relative imports that
// Metro/tsc don't use (see each copy's own header comment) — the actual
// logic must stay byte-identical. This test re-derives what each copy
// *should* contain directly from its source (strip nothing from the
// source; add `.ts` to its relative imports, the one mechanical
// transform), and fails with the exact file and a diff-able mismatch if a
// future change edits the domain engine without re-syncing the copy.
//
// Run as part of `npm test` (see package.json), so it fails in CI on any
// PR that lets these drift — not just when someone remembers to check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// npm scripts (see package.json's `test`) always run with the repo root as
// the working directory — more robust than counting `__dirname` levels back
// out of tsc's outDir, which would silently break if that nesting ever changes.
const REPO_ROOT = process.cwd();

const PAIRS: readonly { readonly source: string; readonly copy: string }[] = [
  { source: 'domain/challenge/types.ts', copy: 'supabase/functions/_shared/check-in-engine/types.ts' },
  { source: 'domain/challenge/periods.ts', copy: 'supabase/functions/_shared/check-in-engine/periods.ts' },
  { source: 'domain/challenge/check-in/types.ts', copy: 'supabase/functions/_shared/check-in-engine/check-in/types.ts' },
  { source: 'domain/challenge/check-in/iso-time.ts', copy: 'supabase/functions/_shared/check-in-engine/check-in/iso-time.ts' },
  { source: 'domain/challenge/check-in/reduction.ts', copy: 'supabase/functions/_shared/check-in-engine/check-in/reduction.ts' },
  { source: 'domain/challenge/check-in/stop-reduction.ts', copy: 'supabase/functions/_shared/check-in-engine/check-in/stop-reduction.ts' },
  { source: 'domain/challenge/check-in/append-plan.ts', copy: 'supabase/functions/_shared/check-in-engine/check-in/append-plan.ts' },
];

/** The one mechanical transform every copy applies to its source: add an explicit `.ts` to every relative import specifier. */
function addTsExtensions(content: string): string {
  return content.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.ts'");
}

for (const { source, copy } of PAIRS) {
  test(`${copy} is byte-identical to ${source}, modulo its header and .ts import extensions`, () => {
    const sourceContent = readFileSync(join(REPO_ROOT, source), 'utf8');
    const copyContent = readFileSync(join(REPO_ROOT, copy), 'utf8');

    // Every copy's header is a fixed 6-line comment block (see e.g.
    // supabase/functions/_shared/check-in-engine/types.ts) followed
    // immediately by the transformed source — strip exactly that many
    // lines, not a pattern match, so a header wording change alone can
    // never accidentally hide a real drift.
    const copyLines = copyContent.split('\n');
    const copyBody = copyLines.slice(6).join('\n');

    assert.equal(
      copyBody,
      addTsExtensions(sourceContent),
      `${copy} has drifted from ${source} — re-copy it (see that file's own header comment) rather than hand-editing the copy.`,
    );
  });
}
