// A tiny, on-device-only crash log — not a replacement for a real
// observability platform (no Sentry/Crashlytics/Bugsnag is wired into this
// app yet), just enough that "what crashed and why" is answerable after the
// fact without a live debugging session. Storage is injected (see
// lib/debug/crash-log-storage.ts), matching
// lib/challenge-creation/creation-session.ts's own pattern, so this file has
// no React Native dependency and can be unit tested directly.

export type CrashLogEntry = {
  readonly message: string;
  readonly stack: string | null;
  readonly componentStack: string | null;
  readonly timestamp: string;
};

export type CrashLogStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const CRASH_LOG_KEY = 'kinwin:crash-log:v1';

// Most-recent-first, capped so a device that crashes repeatedly never grows
// this without bound — only the last few crashes are ever actionable.
const MAX_ENTRIES = 5;

export function buildCrashLogEntry(
  error: unknown,
  componentStack: string | null,
  nowIso: string = new Date().toISOString(),
): CrashLogEntry {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
    componentStack,
    timestamp: nowIso,
  };
}

function isValidCrashLogEntry(value: unknown): value is CrashLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.message === 'string' &&
    (entry.stack === null || typeof entry.stack === 'string') &&
    (entry.componentStack === null || typeof entry.componentStack === 'string') &&
    typeof entry.timestamp === 'string'
  );
}

/** Returns the persisted log, most-recent-first. Never throws — corrupt or unreadable storage reads back as an empty log rather than compounding whatever already went wrong. */
export async function readCrashLog(storage: CrashLogStorage): Promise<readonly CrashLogEntry[]> {
  try {
    const raw = await storage.getItem(CRASH_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidCrashLogEntry) : [];
  } catch {
    return [];
  }
}

/** Prepends one entry and persists, capped at MAX_ENTRIES. Best-effort and never throws: a failure to log a crash must never itself become a second error inside the error-handling path that called this. */
export async function appendCrashLogEntry(entry: CrashLogEntry, storage: CrashLogStorage): Promise<void> {
  try {
    const existing = await readCrashLog(storage);
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    await storage.setItem(CRASH_LOG_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — see doc comment above.
  }
}

export async function clearCrashLog(storage: CrashLogStorage): Promise<void> {
  try {
    await storage.removeItem(CRASH_LOG_KEY);
  } catch {
    // Best-effort — see appendCrashLogEntry's doc comment.
  }
}
