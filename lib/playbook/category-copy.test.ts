import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlaybookCategory } from '../supabase/playbook-repository';

import { PLAYBOOK_CATEGORY_DESCRIPTIONS, PLAYBOOK_CATEGORY_LABELS, PLAYBOOK_CATEGORY_PROMPTS } from './category-copy';

// Derived from the mapping's own keys rather than importing
// PLAYBOOK_CATEGORIES (a runtime const) from playbook-repository.ts, which
// transitively pulls in the real Supabase client and isn't runnable under
// plain `node --test` (see lib/challenge-ux-preview/view-model.ts's own
// comment on this same @/ alias / runtime boundary).
const PLAYBOOK_CATEGORIES = Object.keys(PLAYBOOK_CATEGORY_LABELS) as readonly PlaybookCategory[];

test('every real Playbook category has a label, description, and prompt — no category can silently fall back to undefined copy', () => {
  for (const category of PLAYBOOK_CATEGORIES) {
    assert.ok(PLAYBOOK_CATEGORY_LABELS[category]?.trim().length, `missing label for ${category}`);
    assert.ok(PLAYBOOK_CATEGORY_DESCRIPTIONS[category]?.trim().length, `missing description for ${category}`);
    assert.ok(PLAYBOOK_CATEGORY_PROMPTS[category]?.trim().length, `missing prompt for ${category}`);
  }
});

test('descriptions and prompts are distinct per category — no category was left with a copy-pasted generic string', () => {
  const descriptions = PLAYBOOK_CATEGORIES.map((category) => PLAYBOOK_CATEGORY_DESCRIPTIONS[category]);
  const prompts = PLAYBOOK_CATEGORIES.map((category) => PLAYBOOK_CATEGORY_PROMPTS[category]);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(new Set(prompts).size, prompts.length);
});

test('prompts are phrased as questions, not statements to copy verbatim', () => {
  for (const category of PLAYBOOK_CATEGORIES) {
    assert.ok(PLAYBOOK_CATEGORY_PROMPTS[category].trim().endsWith('?'), `expected a question for ${category}`);
  }
});
