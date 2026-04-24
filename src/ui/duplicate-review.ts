import type { DuplicateFinding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp } from '../lib/domain/pending.js';
import type { PromptAdapter } from './prompts.js';
import type { BwItem } from '../lib/domain/types.js';
import { itemLabel } from './review-loop.js';

export interface DuplicateReviewResult {
  ops: PendingOp[];
  cancelled: boolean;
}

export function formatRevisionHint(item: BwItem): string {
  const raw = item.login?.passwordRevisionDate ?? item.revisionDate;
  if (!raw) return 'revised: unknown';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'revised: unknown';
  return `revised: ${raw.slice(0, 10)}`;
}

export async function presentAllDuplicates(
  findings: readonly DuplicateFinding[],
  prompt: PromptAdapter,
): Promise<DuplicateReviewResult> {
  if (findings.length === 0) return { ops: [], cancelled: false };

  const options: { value: string; label: string; hint: string }[] = [];
  for (const finding of findings) {
    for (const item of finding.items) {
      options.push({
        value: item.id,
        label: itemLabel(item),
        hint: `${finding.key} · ${formatRevisionHint(item)}`,
      });
    }
  }

  prompt.logStep(
    `${findings.length} duplicate group(s) found — check items to delete (unchecked = keep)`,
  );

  const toDelete = await prompt.multiselect<string>(
    'Select items to delete (unchecked items will be kept):',
    options,
  );
  if (toDelete === null) return { ops: [], cancelled: true };

  const deleteSet = new Set(toDelete);
  const groupsLosingAll = findings.filter(f =>
    f.items.every(item => deleteSet.has(item.id)),
  );

  if (groupsLosingAll.length > 0) {
    const names = groupsLosingAll.map(f => f.key).join(', ');
    const confirmed = await prompt.confirm(
      `Warning: all items in ${groupsLosingAll.length} group(s) would be deleted (${names}). Continue?`,
      false,
    );
    if (confirmed === null) return { ops: [], cancelled: true };
    if (!confirmed) {
      for (const f of groupsLosingAll) {
        for (const item of f.items) deleteSet.delete(item.id);
      }
    }
  }

  const ops: PendingOp[] = [];
  for (const id of deleteSet) {
    ops.push(makeDeleteItemOp(id));
  }
  return { ops, cancelled: false };
}
