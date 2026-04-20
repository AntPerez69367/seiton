import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOURNAL_VERSION,
  parseJournal,
  JournalError,
  JournalErrorCode,
} from '../../../src/core/journal-types.js';
import {
  createJournalEntry,
  markOpApplied,
  markComplete,
  markFailed,
  isRecoverable,
  createJournalId,
} from '../../../src/core/journal.js';
import { createFixedClock } from '../../../src/adapters/clock.js';

const FIXED_TIME = new Date('2026-01-15T10:30:00.000Z');
const clock = createFixedClock(FIXED_TIME);

describe('journal-types', () => {
  describe('JOURNAL_VERSION', () => {
    it('is 1', () => {
      assert.equal(JOURNAL_VERSION, 1);
    });
  });

  describe('parseJournal', () => {
    it('parses a valid journal entry', () => {
      const raw = {
        version: 1,
        id: 'abc123',
        command: 'config set',
        startedAt: '2026-01-15T10:30:00.000Z',
        status: 'pending',
        operations: [
          { type: 'write', path: '/home/user/.config/seiton/config.json', status: 'pending' },
        ],
      };
      const result = parseJournal(raw);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.id, 'abc123');
        assert.equal(result.data.command, 'config set');
        assert.equal(result.data.operations.length, 1);
      }
    });

    it('rejects entry with missing required fields', () => {
      const raw = { version: 1, id: 'abc' };
      const result = parseJournal(raw);
      assert.equal(result.success, false);
    });

    it('rejects entry with wrong version', () => {
      const raw = {
        version: 2,
        id: 'abc123',
        command: 'config set',
        startedAt: '2026-01-15T10:30:00.000Z',
        status: 'pending',
        operations: [],
      };
      const result = parseJournal(raw);
      assert.equal(result.success, false);
    });

    it('accepts entry with dryRun flag', () => {
      const raw = {
        version: 1,
        id: 'abc123',
        command: 'config set',
        startedAt: '2026-01-15T10:30:00.000Z',
        status: 'pending',
        dryRun: true,
        operations: [],
      };
      const result = parseJournal(raw);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.dryRun, true);
      }
    });

    it('accepts all valid statuses', () => {
      for (const status of ['pending', 'committed', 'rolled_back', 'failed']) {
        const raw = {
          version: 1,
          id: 'x',
          command: 'test',
          startedAt: '2026-01-01T00:00:00.000Z',
          status,
          operations: [],
        };
        const result = parseJournal(raw);
        assert.equal(result.success, true, `status '${status}' should be valid`);
      }
    });

    it('rejects invalid status', () => {
      const raw = {
        version: 1,
        id: 'x',
        command: 'test',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'unknown',
        operations: [],
      };
      const result = parseJournal(raw);
      assert.equal(result.success, false);
    });

    it('accepts operations with backupPath', () => {
      const raw = {
        version: 1,
        id: 'x',
        command: 'test',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'pending',
        operations: [
          { type: 'write', path: '/a/b', backupPath: '/tmp/bk', status: 'applied' },
        ],
      };
      const result = parseJournal(raw);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.operations[0]!.backupPath, '/tmp/bk');
      }
    });
  });

  describe('JournalError', () => {
    it('creates error with code and message', () => {
      const err = new JournalError(JournalErrorCode.JOURNAL_CORRUPT, 'bad data');
      assert.equal(err.code, 'JOURNAL_CORRUPT');
      assert.equal(err.message, 'bad data');
      assert.equal(err.name, 'JournalError');
    });
  });
});

describe('journal', () => {
  describe('createJournalId', () => {
    it('generates a 24-character hex string', () => {
      const id = createJournalId();
      assert.equal(id.length, 24);
      assert.match(id, /^[0-9a-f]+$/);
    });

    it('generates unique ids', () => {
      const ids = new Set(Array.from({ length: 10 }, () => createJournalId()));
      assert.equal(ids.size, 10);
    });
  });

  describe('createJournalEntry', () => {
    it('creates a pending entry with correct fields', () => {
      const entry = createJournalEntry('config set', [
        { type: 'write', path: '/a/b.json' },
      ], clock);
      assert.equal(entry.version, JOURNAL_VERSION);
      assert.equal(entry.command, 'config set');
      assert.equal(entry.startedAt, '2026-01-15T10:30:00.000Z');
      assert.equal(entry.status, 'pending');
      assert.equal(entry.operations.length, 1);
      assert.equal(entry.operations[0]!.type, 'write');
      assert.equal(entry.operations[0]!.path, '/a/b.json');
      assert.equal(entry.operations[0]!.status, 'pending');
    });

    it('marks dryRun when specified', () => {
      const entry = createJournalEntry('discard', [], clock, true);
      assert.equal(entry.dryRun, true);
    });

    it('omits dryRun when false', () => {
      const entry = createJournalEntry('discard', [], clock, false);
      assert.equal(entry.dryRun, undefined);
    });
  });

  describe('markOpApplied', () => {
    it('marks a specific operation as applied', () => {
      const entry = createJournalEntry('test', [
        { type: 'write', path: '/a' },
        { type: 'remove', path: '/b' },
      ], clock);
      const updated = markOpApplied(entry, 0, '/backups/x');
      assert.equal(updated.operations[0]!.status, 'applied');
      assert.equal(updated.operations[0]!.backupPath, '/backups/x');
      assert.equal(updated.operations[1]!.status, 'pending');
    });
  });

  describe('markComplete', () => {
    it('sets status to committed', () => {
      const entry = createJournalEntry('test', [], clock);
      const done = markComplete(entry);
      assert.equal(done.status, 'committed');
    });
  });

  describe('markFailed', () => {
    it('sets status to failed', () => {
      const entry = createJournalEntry('test', [], clock);
      const failed = markFailed(entry);
      assert.equal(failed.status, 'failed');
    });
  });

  describe('isRecoverable', () => {
    it('returns true for pending entries', () => {
      const entry = createJournalEntry('test', [], clock);
      assert.equal(isRecoverable(entry), true);
    });

    it('returns true for failed entries', () => {
      const entry = markFailed(createJournalEntry('test', [], clock));
      assert.equal(isRecoverable(entry), true);
    });

    it('returns false for committed entries', () => {
      const entry = markComplete(createJournalEntry('test', [], clock));
      assert.equal(isRecoverable(entry), false);
    });

    it('returns false for rolled_back entries', () => {
      const entry = { ...createJournalEntry('test', [], clock), status: 'rolled_back' as const };
      assert.equal(isRecoverable(entry), false);
    });
  });
});
