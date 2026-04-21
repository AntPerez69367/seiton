import { z } from 'zod';

export const JOURNAL_VERSION = 1;

export const JOURNAL_OP_TYPES = ['write', 'remove'] as const;
export type JournalOpType = (typeof JOURNAL_OP_TYPES)[number];

export const JOURNAL_STATUSES = ['pending', 'committed', 'rolled_back', 'failed'] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const JOURNAL_OP_STATUSES = ['pending', 'applied', 'rolled_back'] as const;
export type JournalOpStatus = (typeof JOURNAL_OP_STATUSES)[number];

const JournalOperationSchema = z.object({
  type: z.enum(JOURNAL_OP_TYPES),
  path: z.string().min(1),
  backupPath: z.string().optional(),
  status: z.enum(JOURNAL_OP_STATUSES),
});

export const JournalEntrySchema = z.object({
  version: z.literal(JOURNAL_VERSION),
  id: z.string().min(1),
  command: z.string().min(1),
  startedAt: z.string().min(1),
  status: z.enum(JOURNAL_STATUSES),
  operations: z.array(JournalOperationSchema),
  dryRun: z.boolean().optional(),
});

export type JournalOperation = z.infer<typeof JournalOperationSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export function parseJournal(
  raw: unknown,
): { success: true; data: JournalEntry } | { success: false; error: z.ZodError } {
  return JournalEntrySchema.safeParse(raw) as
    | { success: true; data: JournalEntry }
    | { success: false; error: z.ZodError };
}

export const JournalErrorCode = {
  JOURNAL_CORRUPT: 'JOURNAL_CORRUPT',
  JOURNAL_VERSION_MISMATCH: 'JOURNAL_VERSION_MISMATCH',
  JOURNAL_STALE: 'JOURNAL_STALE',
  JOURNAL_IO: 'JOURNAL_IO',
} as const;

export type JournalErrorCode = (typeof JournalErrorCode)[keyof typeof JournalErrorCode];

export class JournalError extends Error {
  readonly code: JournalErrorCode;
  constructor(code: JournalErrorCode, message: string) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
  }
}
