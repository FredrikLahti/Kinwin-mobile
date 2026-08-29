import assert from 'node:assert/strict';
import test from 'node:test';

import { appendCrashLogEntry, buildCrashLogEntry, clearCrashLog, CrashLogStorage, readCrashLog } from './crash-log';

function memoryStorage(): CrashLogStorage {
  const store = new Map<string, string>();
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async (key) => { store.delete(key); },
  };
}

test('buildCrashLogEntry captures message and stack from a real Error', () => {
  const error = new Error('boom');
  const entry = buildCrashLogEntry(error, 'at <App>', '2026-08-25T00:00:00.000Z');
  assert.equal(entry.message, 'boom');
  assert.equal(typeof entry.stack, 'string');
  assert.equal(entry.componentStack, 'at <App>');
  assert.equal(entry.timestamp, '2026-08-25T00:00:00.000Z');
});

test('buildCrashLogEntry falls back to String() for a non-Error throw', () => {
  const entry = buildCrashLogEntry('a plain string throw', null, '2026-08-25T00:00:00.000Z');
  assert.equal(entry.message, 'a plain string throw');
  assert.equal(entry.stack, null);
});

test('readCrashLog returns empty for no stored value', async () => {
  const storage = memoryStorage();
  assert.deepEqual(await readCrashLog(storage), []);
});

test('appendCrashLogEntry persists and prepends, most-recent-first', async () => {
  const storage = memoryStorage();
  await appendCrashLogEntry(buildCrashLogEntry('first', null, '2026-08-25T00:00:00.000Z'), storage);
  await appendCrashLogEntry(buildCrashLogEntry('second', null, '2026-08-25T00:01:00.000Z'), storage);
  const log = await readCrashLog(storage);
  assert.equal(log.length, 2);
  assert.equal(log[0].message, 'second');
  assert.equal(log[1].message, 'first');
});

test('appendCrashLogEntry caps the log at 5 entries', async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 8; i += 1) {
    await appendCrashLogEntry(buildCrashLogEntry(`crash-${i}`, null, `2026-08-25T00:0${i}:00.000Z`), storage);
  }
  const log = await readCrashLog(storage);
  assert.equal(log.length, 5);
  assert.equal(log[0].message, 'crash-7');
  assert.equal(log[4].message, 'crash-3');
});

test('readCrashLog discards corrupt JSON rather than throwing', async () => {
  const storage = memoryStorage();
  await storage.setItem('kinwin:crash-log:v1', 'not json');
  assert.deepEqual(await readCrashLog(storage), []);
});

test('readCrashLog discards non-array or malformed entries', async () => {
  const storage = memoryStorage();
  await storage.setItem('kinwin:crash-log:v1', JSON.stringify({ not: 'an array' }));
  assert.deepEqual(await readCrashLog(storage), []);

  await storage.setItem('kinwin:crash-log:v1', JSON.stringify([{ message: 'ok', stack: null, componentStack: null, timestamp: 't' }, { garbage: true }]));
  const log = await readCrashLog(storage);
  assert.equal(log.length, 1);
  assert.equal(log[0].message, 'ok');
});

test('clearCrashLog removes the stored log', async () => {
  const storage = memoryStorage();
  await appendCrashLogEntry(buildCrashLogEntry('gone soon', null), storage);
  assert.equal((await readCrashLog(storage)).length, 1);
  await clearCrashLog(storage);
  assert.deepEqual(await readCrashLog(storage), []);
});

test('a storage that throws never propagates out of read/append/clear', async () => {
  const throwingStorage: CrashLogStorage = {
    getItem: async () => { throw new Error('disk full'); },
    setItem: async () => { throw new Error('disk full'); },
    removeItem: async () => { throw new Error('disk full'); },
  };
  assert.deepEqual(await readCrashLog(throwingStorage), []);
  await assert.doesNotReject(appendCrashLogEntry(buildCrashLogEntry('x', null), throwingStorage));
  await assert.doesNotReject(clearCrashLog(throwingStorage));
});
