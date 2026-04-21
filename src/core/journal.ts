import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { FsAdapter } from '../adapters/fs.js';
import type { Clock } from '../adapters/clock.js';
import type { Logger } from '../adapters/logging.js';
import {
  JOURNAL_VERSION,
  JournalError,
  JournalErrorCode,
  parseJournal,
  type JournalEntry,
  type JournalOperation,
} from './journal-types.js';

export { JOURNAL_VERSION, JournalError, JournalErrorCode, parseJournal } from './journal-types.js';
export type { JournalEntry, JournalOperation, JournalOpType, JournalStatus } from './journal-types.js';

export interface JournalOptions {
  journalPath: string;
  backupDir: string;
  fs: FsAdapter;
  clock: Clock;
  logger?: Logger;
}

export function createJournalId(): string {
  return randomBytes(12).toString('hex');
}

export function createJournalEntry(
  command: string,
  operations: readonly { type: 'write' | 'remove'; path: string }[],
  clock: Clock,
  dryRun?: boolean,
): JournalEntry {
  return {
    version: JOURNAL_VERSION,
    id: createJournalId(),
    command,
    startedAt: clock.isoNow(),
    status: 'pending',
    dryRun: dryRun || undefined,
    operations: operations.map((op) => ({
      type: op.type,
      path: op.path,
      status: 'pending' as const,
    })),
  };
}

export async function writeJournal(
  entry: JournalEntry,
  opts: JournalOptions,
): Promise<void> {
  opts.logger?.debug('journal: writing', { id: entry.id, status: entry.status });
  await opts.fs.ensureDir(dirname(opts.journalPath));
  await opts.fs.writeAtomic(opts.journalPath, JSON.stringify(entry, null, 2));
}

export async function readJournal(
  opts: JournalOptions,
): Promise<JournalEntry | null> {
  const exists = await opts.fs.exists(opts.journalPath);
  if (!exists) return null;

  const raw = await opts.fs.readText(opts.journalPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JournalError(
      JournalErrorCode.JOURNAL_CORRUPT,
      `Journal at ${opts.journalPath} contains invalid JSON`,
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj === 'object' && obj !== null && 'version' in obj) {
    const ver = obj.version;
    if (typeof ver === 'number' && ver > JOURNAL_VERSION) {
      throw new JournalError(
        JournalErrorCode.JOURNAL_VERSION_MISMATCH,
        `Journal version ${ver} is newer than supported version ${JOURNAL_VERSION}. Upgrade seiton.`,
      );
    }
  }

  const result = parseJournal(parsed);
  if (!result.success) {
    throw new JournalError(
      JournalErrorCode.JOURNAL_CORRUPT,
      `Journal at ${opts.journalPath} failed validation: ${result.error.message}`,
    );
  }

  return result.data;
}

export async function removeJournal(opts: JournalOptions): Promise<void> {
  opts.logger?.debug('journal: removing', { path: opts.journalPath });
  await opts.fs.remove(opts.journalPath);
}

export async function backupFile(
  filePath: string,
  journalId: string,
  opIndex: number,
  opts: JournalOptions,
): Promise<string> {
  const exists = await opts.fs.exists(filePath);
  if (!exists) return '';

  await opts.fs.ensureDir(opts.backupDir);
  const backupName = `${journalId}-${opIndex}-backup`;
  const backupPath = join(opts.backupDir, backupName);
  const content = await opts.fs.readText(filePath);
  await opts.fs.writeAtomic(backupPath, content);
  opts.logger?.debug('journal: backed up file', { from: filePath, to: backupPath });
  return backupPath;
}

export async function rollbackEntry(
  entry: JournalEntry,
  opts: JournalOptions,
): Promise<JournalEntry> {
  opts.logger?.info('journal: rolling back', { id: entry.id, command: entry.command });
  const updatedOps: JournalOperation[] = [];

  for (const op of entry.operations) {
    const recordsBackup = op.status === 'applied' || (op.status === 'pending' && Boolean(op.backupPath));
    if (!recordsBackup) {
      updatedOps.push({ ...op, status: 'rolled_back' });
      continue;
    }

    if (op.type === 'write' && op.backupPath) {
      const hasBackup = await opts.fs.exists(op.backupPath);
      if (hasBackup) {
        const content = await opts.fs.readText(op.backupPath);
        await opts.fs.writeAtomic(op.path, content);
      } else {
        await opts.fs.remove(op.path);
      }
    } else if (op.type === 'write' && !op.backupPath) {
      await opts.fs.remove(op.path);
    } else if (op.type === 'remove' && op.backupPath) {
      const hasBackup = await opts.fs.exists(op.backupPath);
      if (hasBackup) {
        const content = await opts.fs.readText(op.backupPath);
        await opts.fs.writeAtomic(op.path, content);
      }
    }
    updatedOps.push({ ...op, status: 'rolled_back' });
  }

  const rolled: JournalEntry = { ...entry, status: 'rolled_back', operations: updatedOps };
  await writeJournal(rolled, opts);
  return rolled;
}

export async function cleanupBackups(
  entry: JournalEntry,
  opts: JournalOptions,
): Promise<void> {
  for (const op of entry.operations) {
    if (op.backupPath) {
      await opts.fs.remove(op.backupPath);
    }
  }
  opts.logger?.debug('journal: cleaned up backups', { id: entry.id });
}

export function isRecoverable(entry: JournalEntry): boolean {
  return entry.status === 'pending' || entry.status === 'failed';
}

function updateOpStatus(
  entry: JournalEntry,
  index: number,
  status: 'applied' | 'rolled_back',
  backupPath?: string,
): JournalEntry {
  const ops = entry.operations.map((op, i) =>
    i === index ? { ...op, status, ...(backupPath ? { backupPath } : {}) } : op,
  );
  return { ...entry, operations: ops };
}

export function markOpApplied(
  entry: JournalEntry,
  index: number,
  backupPath?: string,
): JournalEntry {
  return updateOpStatus(entry, index, 'applied', backupPath);
}

export function setOpBackup(
  entry: JournalEntry,
  index: number,
  backupPath: string,
): JournalEntry {
  const ops = entry.operations.map((op, i) =>
    i === index ? { ...op, ...(backupPath ? { backupPath } : {}) } : op,
  );
  return { ...entry, operations: ops };
}

export function markComplete(entry: JournalEntry): JournalEntry {
  return { ...entry, status: 'committed' };
}

export function markFailed(entry: JournalEntry): JournalEntry {
  return { ...entry, status: 'failed' };
}
