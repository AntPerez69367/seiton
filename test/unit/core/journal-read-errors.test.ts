import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readJournal, type JournalOptions } from '../../../src/core/journal.js';
import { JournalError, JournalErrorCode } from '../../../src/core/journal-types.js';
import { createFixedClock } from '../../../src/adapters/clock.js';
import type { FsAdapter } from '../../../src/adapters/fs.js';
import { FsError, FsErrorCode } from '../../../src/adapters/fs.js';

const FIXED_TIME = new Date('2026-01-15T10:30:00.000Z');
const clock = createFixedClock(FIXED_TIME);

function makeMockFs(overrides: Partial<FsAdapter>): FsAdapter {
  return {
    readText: overrides.readText ?? (async () => ''),
    writeAtomic: overrides.writeAtomic ?? (async () => {}),
    remove: overrides.remove ?? (async () => {}),
    exists: overrides.exists ?? (async () => false),
    ensureDir: overrides.ensureDir ?? (async () => {}),
  };
}

function makeOpts(fs: FsAdapter): JournalOptions {
  return {
    journalPath: '/fake/state/journal.json',
    backupDir: '/fake/state/backups',
    fs,
    clock,
  };
}

describe('readJournal error paths', () => {
  it('returns null when journal file does not exist', async () => {
    const fs = makeMockFs({ exists: async () => false });
    const result = await readJournal(makeOpts(fs));
    assert.equal(result, null);
  });

  it('throws JOURNAL_CORRUPT when file contains invalid JSON', async () => {
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => '{not valid json!!!',
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof JournalError);
        assert.equal(err.code, JournalErrorCode.JOURNAL_CORRUPT);
        assert.ok(err.message.includes('invalid JSON'));
        return true;
      },
    );
  });

  it('throws JOURNAL_VERSION_MISMATCH when version is higher than supported', async () => {
    const futureJournal = JSON.stringify({
      version: 99,
      id: 'x',
      command: 'test',
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'pending',
      operations: [],
    });
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => futureJournal,
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof JournalError);
        assert.equal(err.code, JournalErrorCode.JOURNAL_VERSION_MISMATCH);
        assert.ok(err.message.includes('version 99'));
        assert.ok(err.message.includes('Upgrade seiton'));
        return true;
      },
    );
  });

  it('throws JOURNAL_CORRUPT when JSON is valid but fails schema validation', async () => {
    const invalidSchema = JSON.stringify({
      version: 1,
      id: 'x',
      command: 'test',
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'bogus_status',
      operations: [],
    });
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => invalidSchema,
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof JournalError);
        assert.equal(err.code, JournalErrorCode.JOURNAL_CORRUPT);
        assert.ok(err.message.includes('failed validation'));
        return true;
      },
    );
  });

  it('throws JOURNAL_CORRUPT when operations have invalid op type', async () => {
    const badOps = JSON.stringify({
      version: 1,
      id: 'abc',
      command: 'test',
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'pending',
      operations: [
        { type: 'invalid_type', path: '/a', status: 'pending' },
      ],
    });
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => badOps,
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof JournalError);
        assert.equal(err.code, JournalErrorCode.JOURNAL_CORRUPT);
        return true;
      },
    );
  });

  it('propagates FsError when readText throws a filesystem error', async () => {
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => {
        throw new FsError(FsErrorCode.PERMISSION_DENIED, '/fake/journal.json', 'Permission denied');
      },
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof FsError);
        assert.equal(err.code, FsErrorCode.PERMISSION_DENIED);
        return true;
      },
    );
  });

  it('propagates FsError when exists() throws a filesystem error', async () => {
    const fs = makeMockFs({
      exists: async () => {
        throw new FsError(FsErrorCode.PERMISSION_DENIED, '/fake/journal.json', 'Permission denied');
      },
    });

    await assert.rejects(
      () => readJournal(makeOpts(fs)),
      (err: unknown) => {
        assert.ok(err instanceof FsError);
        assert.equal(err.code, FsErrorCode.PERMISSION_DENIED);
        return true;
      },
    );
  });

  it('successfully reads a valid journal entry', async () => {
    const validJournal = JSON.stringify({
      version: 1,
      id: 'valid-id',
      command: 'config set',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'pending',
      operations: [
        { type: 'write', path: '/a/b.json', status: 'pending' },
      ],
    });
    const fs = makeMockFs({
      exists: async () => true,
      readText: async () => validJournal,
    });

    const result = await readJournal(makeOpts(fs));
    assert.notEqual(result, null);
    assert.equal(result!.id, 'valid-id');
    assert.equal(result!.command, 'config set');
    assert.equal(result!.operations.length, 1);
  });
});
