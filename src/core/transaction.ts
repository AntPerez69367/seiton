import type { FsAdapter } from '../adapters/fs.js';
import type { Clock } from '../adapters/clock.js';
import type { Logger } from '../adapters/logging.js';
import { dirOf } from './fs-utils.js';
import {
  createJournalEntry,
  writeJournal,
  readJournal,
  removeJournal,
  backupFile,
  rollbackEntry,
  cleanupBackups,
  markOpApplied,
  markComplete,
  markFailed,
  isRecoverable,
  type JournalOptions,
} from './journal.js';

export interface WriteOp {
  type: 'write';
  path: string;
  content: string;
  mode?: number;
}

export interface RemoveOp {
  type: 'remove';
  path: string;
}

export type TransactionOp = WriteOp | RemoveOp;

export interface TransactionOptions {
  journalPath: string;
  backupDir: string;
  fs: FsAdapter;
  clock: Clock;
  logger?: Logger;
  dryRun?: boolean;
  faultInjection?: FaultInjectionHook;
}

export type FaultInjectionHook = (opIndex: number, phase: 'before' | 'after') => void;

export interface TransactionResult {
  success: boolean;
  journalId: string;
  appliedCount: number;
  rolledBack: boolean;
}

export async function executeTransaction(
  command: string,
  operations: readonly TransactionOp[],
  opts: TransactionOptions,
): Promise<TransactionResult> {
  const journalOpts: JournalOptions = {
    journalPath: opts.journalPath,
    backupDir: opts.backupDir,
    fs: opts.fs,
    clock: opts.clock,
    logger: opts.logger,
  };

  const plannedOps = operations.map((op) => ({ type: op.type, path: op.path }));
  let entry = createJournalEntry(command, plannedOps, opts.clock, opts.dryRun);

  if (opts.dryRun) {
    opts.logger?.info('transaction: dry-run mode, no changes will be made', {
      command,
      operations: plannedOps,
    });
    return { success: true, journalId: entry.id, appliedCount: 0, rolledBack: false };
  }

  await opts.fs.ensureDir(opts.backupDir);
  await writeJournal(entry, journalOpts);

  let appliedCount = 0;
  try {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]!;
      opts.faultInjection?.(i, 'before');

      const bkPath = await backupFile(op.path, entry.id, i, journalOpts);
      if (op.type === 'write') {
        await opts.fs.ensureDir(dirOf(op.path));
        await opts.fs.writeAtomic(op.path, op.content, op.mode);
      } else {
        await opts.fs.remove(op.path);
      }

      entry = markOpApplied(entry, i, bkPath || undefined);
      await writeJournal(entry, journalOpts);
      appliedCount++;
      opts.faultInjection?.(i, 'after');
    }

    entry = markComplete(entry);
    await writeJournal(entry, journalOpts);
    await cleanupBackups(entry, journalOpts);
    await removeJournal(journalOpts);

    return { success: true, journalId: entry.id, appliedCount, rolledBack: false };
  } catch (err: unknown) {
    opts.logger?.error('transaction: operation failed, rolling back', {
      id: entry.id,
      appliedCount,
      error: err instanceof Error ? err.message : String(err),
    });
    entry = markFailed(entry);
    await writeJournal(entry, journalOpts).catch((e: unknown) => { opts.logger?.warn('transaction: rollback/cleanup step failed', { error: e instanceof Error ? e.message : String(e) }); });
    await rollbackEntry(entry, journalOpts).catch((e: unknown) => { opts.logger?.warn('transaction: rollback/cleanup step failed', { error: e instanceof Error ? e.message : String(e) }); });
    await cleanupBackups(entry, journalOpts).catch((e: unknown) => { opts.logger?.warn('transaction: rollback/cleanup step failed', { error: e instanceof Error ? e.message : String(e) }); });
    await removeJournal(journalOpts).catch((e: unknown) => { opts.logger?.warn('transaction: rollback/cleanup step failed', { error: e instanceof Error ? e.message : String(e) }); });
    return { success: false, journalId: entry.id, appliedCount, rolledBack: true };
  }
}

export async function recoverFromJournal(
  opts: TransactionOptions,
): Promise<TransactionResult | null> {
  const journalOpts: JournalOptions = {
    journalPath: opts.journalPath,
    backupDir: opts.backupDir,
    fs: opts.fs,
    clock: opts.clock,
    logger: opts.logger,
  };

  const entry = await readJournal(journalOpts);
  if (!entry) return null;

  if (!isRecoverable(entry)) {
    await cleanupBackups(entry, journalOpts);
    await removeJournal(journalOpts);
    return null;
  }

  opts.logger?.warn('transaction: recovering from interrupted journal', {
    id: entry.id,
    command: entry.command,
    status: entry.status,
  });

  await rollbackEntry(entry, journalOpts);
  await cleanupBackups(entry, journalOpts);
  await removeJournal(journalOpts);

  const appliedCount = entry.operations.filter((o) => o.status === 'applied').length;
  return { success: false, journalId: entry.id, appliedCount, rolledBack: true };
}

