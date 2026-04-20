import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFsAdapter } from '../../../src/adapters/fs.js';
import { createFixedClock } from '../../../src/adapters/clock.js';
import { recoverFromJournal, type TransactionOptions } from '../../../src/core/transaction.js';
import type { JournalEntry } from '../../../src/core/journal-types.js';

const FIXED_TIME = new Date('2026-01-15T10:30:00.000Z');

function makeOpts(tmp: string): TransactionOptions {
  return {
    journalPath: join(tmp, 'state', 'journal.json'),
    backupDir: join(tmp, 'state', 'backups'),
    fs: createFsAdapter(),
    clock: createFixedClock(FIXED_TIME),
  };
}

describe('recoverFromJournal — real filesystem', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-journal-fs-'));
  });

  it('rolls back a pending journal with applied write ops using backup files', async () => {
    const opts = makeOpts(tmp);
    const targetFile = join(tmp, 'data', 'config.json');

    await mkdir(join(tmp, 'data'), { recursive: true });
    await writeFile(targetFile, 'modified-content');

    await mkdir(join(tmp, 'state', 'backups'), { recursive: true });
    const backupPath = join(tmp, 'state', 'backups', 'test-journal-id-0-backup');
    await writeFile(backupPath, 'original-content');

    const journal: JournalEntry = {
      version: 1,
      id: 'test-journal-id',
      command: 'config set',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'pending',
      operations: [
        { type: 'write', path: targetFile, backupPath, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    const result = await recoverFromJournal(opts);

    assert.notEqual(result, null);
    assert.equal(result!.success, false);
    assert.equal(result!.rolledBack, true);
    assert.equal(result!.appliedCount, 1);

    const restored = await readFile(targetFile, 'utf-8');
    assert.equal(restored, 'original-content');

    const journalExists = await opts.fs.exists(opts.journalPath);
    assert.equal(journalExists, false);
  });

  it('rolls back a failed journal with multiple ops, restoring from backups', async () => {
    const opts = makeOpts(tmp);
    const file1 = join(tmp, 'data', 'file1.txt');
    const file2 = join(tmp, 'data', 'file2.txt');

    await mkdir(join(tmp, 'data'), { recursive: true });
    await writeFile(file1, 'modified-1');
    await writeFile(file2, 'modified-2');

    await mkdir(join(tmp, 'state', 'backups'), { recursive: true });
    const backup1 = join(tmp, 'state', 'backups', 'multi-id-0-backup');
    const backup2 = join(tmp, 'state', 'backups', 'multi-id-1-backup');
    await writeFile(backup1, 'original-1');
    await writeFile(backup2, 'original-2');

    const journal: JournalEntry = {
      version: 1,
      id: 'multi-id',
      command: 'batch update',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'failed',
      operations: [
        { type: 'write', path: file1, backupPath: backup1, status: 'applied' },
        { type: 'write', path: file2, backupPath: backup2, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    const result = await recoverFromJournal(opts);

    assert.notEqual(result, null);
    assert.equal(result!.rolledBack, true);
    assert.equal(result!.appliedCount, 2);

    const content1 = await readFile(file1, 'utf-8');
    assert.equal(content1, 'original-1');
    const content2 = await readFile(file2, 'utf-8');
    assert.equal(content2, 'original-2');
  });

  it('rolls back a write op with no backup by removing the file', async () => {
    const opts = makeOpts(tmp);
    const targetFile = join(tmp, 'data', 'new-file.json');

    await mkdir(join(tmp, 'data'), { recursive: true });
    await writeFile(targetFile, 'content-that-should-be-removed');

    const journal: JournalEntry = {
      version: 1,
      id: 'no-backup-id',
      command: 'test',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'pending',
      operations: [
        { type: 'write', path: targetFile, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    const result = await recoverFromJournal(opts);

    assert.notEqual(result, null);
    assert.equal(result!.rolledBack, true);

    const exists = await opts.fs.exists(targetFile);
    assert.equal(exists, false);
  });

  it('rolls back a remove op by restoring from backup', async () => {
    const opts = makeOpts(tmp);
    const targetFile = join(tmp, 'data', 'removed.txt');

    await mkdir(join(tmp, 'state', 'backups'), { recursive: true });
    const backupPath = join(tmp, 'state', 'backups', 'remove-id-0-backup');
    await writeFile(backupPath, 'restored-content');

    const journal: JournalEntry = {
      version: 1,
      id: 'remove-id',
      command: 'discard',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'pending',
      operations: [
        { type: 'remove', path: targetFile, backupPath, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await mkdir(join(tmp, 'data'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    const result = await recoverFromJournal(opts);

    assert.notEqual(result, null);
    assert.equal(result!.rolledBack, true);

    const content = await readFile(targetFile, 'utf-8');
    assert.equal(content, 'restored-content');
  });

  it('skips non-recoverable (committed) journal and cleans up', async () => {
    const opts = makeOpts(tmp);

    await mkdir(join(tmp, 'state', 'backups'), { recursive: true });
    const backupPath = join(tmp, 'state', 'backups', 'committed-id-0-backup');
    await writeFile(backupPath, 'leftover-backup');

    const journal: JournalEntry = {
      version: 1,
      id: 'committed-id',
      command: 'config set',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'committed',
      operations: [
        { type: 'write', path: '/some/path', backupPath, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    const result = await recoverFromJournal(opts);

    assert.equal(result, null);

    const journalExists = await opts.fs.exists(opts.journalPath);
    assert.equal(journalExists, false);

    const backupExists = await opts.fs.exists(backupPath);
    assert.equal(backupExists, false);
  });

  it('cleans up backup files after successful recovery', async () => {
    const opts = makeOpts(tmp);
    const targetFile = join(tmp, 'data', 'target.json');

    await mkdir(join(tmp, 'data'), { recursive: true });
    await writeFile(targetFile, 'modified');

    await mkdir(join(tmp, 'state', 'backups'), { recursive: true });
    const backupPath = join(tmp, 'state', 'backups', 'cleanup-id-0-backup');
    await writeFile(backupPath, 'original');

    const journal: JournalEntry = {
      version: 1,
      id: 'cleanup-id',
      command: 'test',
      startedAt: '2026-01-15T10:30:00.000Z',
      status: 'pending',
      operations: [
        { type: 'write', path: targetFile, backupPath, status: 'applied' },
      ],
    };

    await mkdir(join(tmp, 'state'), { recursive: true });
    await writeFile(opts.journalPath, JSON.stringify(journal, null, 2));

    await recoverFromJournal(opts);

    const backupExists = await opts.fs.exists(backupPath);
    assert.equal(backupExists, false);
  });
});
