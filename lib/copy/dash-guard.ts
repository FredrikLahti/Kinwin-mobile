// Fredrik does not want LLM-style dash writing ("Succeed — nothing is
// charged.") anywhere in Kinwin's user-facing copy. This is a lightweight
// line-level heuristic, not a full parser: it skips lines that are clearly
// comments so code-comment prose (which uses dashes constantly throughout
// this codebase) is never flagged, but it cannot distinguish a JSX string
// literal from other code on the same line — that tradeoff is intentional
// for a guard meant to catch obvious drift, not to be a general-purpose
// style linter.
type BannedPattern = { readonly label: string; readonly pattern: RegExp; readonly requiresStringContext: boolean };

const BANNED_PATTERNS: readonly BannedPattern[] = [
  { label: 'em dash', pattern: /—/, requiresStringContext: false },
  { label: 'en dash', pattern: /–/, requiresStringContext: false },
  // "--"/" - " are common in plain arithmetic and JSX expressions
  // (`totalSteps - currentStep`, `1 - progress.value`) that have nothing to
  // do with prose, so these two are only checked on lines that look like
  // they contain a string/template literal — and, since a `${...}`
  // interpolation inside that literal is itself JS expression code (e.g.
  // `` `${a - b}` ``), lines with interpolation are skipped too. This can
  // miss a real violation that sits in literal text alongside an unrelated
  // interpolation on the same line — an accepted tradeoff for a lightweight
  // guard over a full parser.
  { label: 'double hyphen', pattern: /--/, requiresStringContext: true },
  { label: 'spaced hyphen used as a separator', pattern: / - /, requiresStringContext: true },
];

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function looksLikeStringLiteralContext(line: string): boolean {
  return /['"`]/.test(line) && !line.includes('${');
}

export type DashViolation = { readonly label: string; readonly line: number; readonly text: string };

export function findBannedDashes(source: string): DashViolation[] {
  const violations: DashViolation[] = [];
  source.split('\n').forEach((line, index) => {
    if (isCommentLine(line)) return;
    const stringContext = looksLikeStringLiteralContext(line);
    const match = BANNED_PATTERNS.find(
      ({ pattern, requiresStringContext }) => (!requiresStringContext || stringContext) && pattern.test(line),
    );
    if (match) violations.push({ label: match.label, line: index + 1, text: line.trim() });
  });
  return violations;
}
