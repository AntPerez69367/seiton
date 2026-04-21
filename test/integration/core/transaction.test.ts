import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFsAdapter } from '../../../src/adapters/fs.js';
import { createFixedClock } from '../../../src/adapters/clock.js';
import {
  executeTransaction,
  recoverFromJournal,
  type TransactionOptions,
} from '../../../src/core/transaction.js';

const FIXED_TIME = new Date('2026-01-15T10:30:00.000Z');

function makeOpts(tmp: string): TransactionOptions {
  return {
    journalPath: join(tmp, 'state', 'journal.json'),
    backupDir: join(tmp, 'state', 'backups'),
    fs: createFsAdapter(),
    clock: createFixedClock(FIXED_TIME),
  };
}

describe('Transaction executor', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-tx-test-'));
  });

  describe('executeTransaction', () => {
    it('writes files and cleans up journal on success', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'output.json');

      const result = await executeTransaction('config set', [
        { type: 'write', path: target, content: '{"version":1}' },
      ], opts);

      assert.equal(result.success, true);
      assert.equal(result.appliedCount, 1);
      assert.equal(result.rolledBack, false);

      const content = await readFile(target, 'utf-8');
      assert.equal(content, '{"version":1}');

      const journalExists = await opts.fs.exists(opts.journalPath);
      assert.equal(journalExists, false);
    });

    it('removes files as specified', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'to-delete.txt');
      await writeFile(target, 'will be deleted');

      const result = await executeTransaction('discard', [
        { type: 'remove', path: target },
      ], opts);

      assert.equal(result.success, true);
      const exists = await opts.fs.exists(target);
      assert.equal(exists, false);
    });

    it('is idempotent — running twice yields same result', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'idem.json');

      await executeTransaction('config set', [
        { type: 'write', path: target, content: '{"x":1}' },
      ], opts);
      await executeTransaction('config set', [
        { type: 'write', path: target, content: '{"x":1}' },
      ], opts);

      const content = await readFile(target, 'utf-8');
      assert.equal(content, '{"x":1}');
    });

    it('rolls back on failure mid-transaction', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'will-revert.json');
      await writeFile(target, 'original');

      const result = await executeTransaction('multi', [
        { type: 'write', path: target, content: 'modified' },
        { type: 'write', path: join(tmp, 'second.json'), content: 'x' },
      ], {
        ...opts,
        faultInjection: (idx, phase) => {
          if (idx === 1 && phase === 'before') throw new Error('injected failure');
        },
      });

      assert.equal(result.success, false);
      assert.equal(result.rolledBack, true);

      const content = await readFile(target, 'utf-8');
      assert.equal(content, 'original');
    });

    it('handles dry-run mode without modifying anything', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'should-not-exist.json');

      const result = await executeTransaction('config set', [
        { type: 'write', path: target, content: 'data' },
      ], { ...opts, dryRun: true });

      assert.equal(result.success, true);
      assert.equal(result.appliedCount, 0);
      const exists = await opts.fs.exists(target);
      assert.equal(exists, false);
    });

    it('rolls back when fault injection throws mid-op', async () => {
      const opts = makeOpts(tmp);
      const first = join(tmp, 'first.txt');
      const second = join(tmp, 'second.txt');
      await writeFile(first, 'original-first');

      const result = await executeTransaction('test', [
        { type: 'write', path: first, content: 'changed' },
        { type: 'write', path: second, content: 'new-file' },
      ], {
        ...opts,
        faultInjection: (idx, phase) => {
          if (idx === 1 && phase === 'before') throw new Error('simulated crash');
        },
      });

      assert.equal(result.success, false);
      assert.equal(result.rolledBack, true);

      const firstContent = await readFile(first, 'utf-8');
      assert.equal(firstContent, 'original-first');
      const secondExists = await opts.fs.exists(second);
      assert.equal(secondExists, false);
    });

    it('records backup before mutation so crashes after mutation are recoverable', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'write-ahead.txt');
      await writeFile(target, 'original');

      const result = await executeTransaction('test', [
        { type: 'write', path: target, content: 'modified' },
      ], {
        ...opts,
        skipRollbackOnFault: true,
        faultInjection: (idx, phase) => {
          if (idx === 0 && phase === 'after-mutation') throw new Error('crash after mutation');
        },
      });

      assert.equal(result.success, false);
      assert.equal(result.rolledBack, false);

      const midFlightContent = await readFile(target, 'utf-8');
      assert.equal(midFlightContent, 'modified');

      const journalExists = await opts.fs.exists(opts.journalPath);
      assert.equal(journalExists, true);

      const recovery = await recoverFromJournal(opts);
      assert.ok(recovery);
      assert.equal(recovery.rolledBack, true);

      const restored = await readFile(target, 'utf-8');
      assert.equal(restored, 'original');
    });
  });

  describe('recoverFromJournal', () => {
    it('returns null when no journal exists', async () => {
      const opts = makeOpts(tmp);
      const result = await recoverFromJournal(opts);
      assert.equal(result, null);
    });

    it('recovers and rolls back a pending journal', async () => {
      const opts = makeOpts(tmp);
      const target = join(tmp, 'recover-target.json');
      await writeFile(target, 'original');

      const crashed = await executeTransaction('test', [
        { type: 'write', path: target, content: 'modified' },
        { type: 'write', path: join(tmp, 'second.txt'), content: 'data' },
      ], {
        ...opts,
        skipRollbackOnFault: true,
        faultInjection: (idx, phase) => {
          if (idx === 1 && phase === 'before') throw new Error('simulated interrupt');
        },
      });

      assert.equal(crashed.success, false);
      assert.equal(crashed.rolledBack, false);

      const midFlight = await readFile(target, 'utf-8');
      assert.equal(midFlight, 'modified');

      const journalExists = await opts.fs.exists(opts.journalPath);
      assert.equal(journalExists, true);

      const recovery = await recoverFromJournal(opts);
      assert.ok(recovery);
      assert.equal(recovery.rolledBack, true);

      const restored = await readFile(target, 'utf-8');
      assert.equal(restored, 'original');

      const journalAfter = await opts.fs.exists(opts.journalPath);
      assert.equal(journalAfter, false);
    });
  });
});
