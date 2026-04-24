import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presentAllDuplicates, formatRevisionHint } from '../../../src/ui/duplicate-review.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import type { DuplicateFinding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'test-id',
    organizationId: null,
    folderId: null,
    type: 1,
    name: 'Test Item',
    notes: null,
    favorite: false,
    login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'pass', totp: null },
    revisionDate: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

interface MockConfig {
  multiselectResponse?: number[] | null;
  confirmResponse?: boolean | null;
}

function makeMockPrompt(config: MockConfig = {}): PromptAdapter {
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(): Promise<T | null> { return null; },
    async confirm(): Promise<boolean | null> {
      return config.confirmResponse ?? null;
    },
    async multiselect<T>(_msg: string, options: { value: T }[]): Promise<T[] | null> {
      const resp = config.multiselectResponse;
      if (resp === undefined) return [];
      if (resp === null) return null;
      return resp.map(i => options[i]!.value);
    },
    async text(): Promise<string | null> { return ''; },
    startSpinner(): SpinnerHandle { return noopSpinner; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

describe('formatRevisionHint', () => {
  it('uses passwordRevisionDate when available', () => {
    const item = makeItem({ login: { uris: null, username: null, password: null, totp: null, passwordRevisionDate: '2024-06-15T12:00:00.000Z' } });
    assert.equal(formatRevisionHint(item), 'revised: 2024-06-15');
  });

  it('falls back to revisionDate when no passwordRevisionDate', () => {
    const item = makeItem({ revisionDate: '2024-01-15T00:00:00.000Z' });
    assert.equal(formatRevisionHint(item), 'revised: 2024-01-15');
  });

  it('returns unknown for invalid date', () => {
    const item = makeItem({ revisionDate: 'not-a-date', login: null });
    assert.equal(formatRevisionHint(item), 'revised: unknown');
  });
});

describe('presentAllDuplicates', () => {
  it('returns empty ops for empty findings', async () => {
    const result = await presentAllDuplicates([], makeMockPrompt());
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, false);
  });

  it('generates delete ops for checked items across multiple groups', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a1' }), makeItem({ id: 'a2' })], key: 'group-a' },
      { category: 'duplicates', items: [makeItem({ id: 'b1' }), makeItem({ id: 'b2' })], key: 'group-b' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponse: [1, 3] }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'delete_item');
    assert.equal(result.ops[1]!.kind, 'delete_item');
    if (result.ops[0]!.kind === 'delete_item') assert.equal(result.ops[0]!.itemId, 'a2');
    if (result.ops[1]!.kind === 'delete_item') assert.equal(result.ops[1]!.itemId, 'b2');
  });

  it('returns cancelled when multiselect returns null', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponse: null }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, true);
  });

  it('returns no ops when nothing is checked', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponse: [] }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, false);
  });

  it('triggers safety confirm when all items in a group are checked', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 1],
      confirmResponse: true,
    }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.cancelled, false);
  });

  it('removes group items from delete set when safety confirm is declined', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
      { category: 'duplicates', items: [makeItem({ id: 'c' }), makeItem({ id: 'd' })], key: 'k2' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 1, 3],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 1);
    if (result.ops[0]!.kind === 'delete_item') assert.equal(result.ops[0]!.itemId, 'd');
  });

  it('returns cancelled when safety confirm returns null', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 1],
      confirmResponse: null,
    }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, true);
  });

  it('does not trigger safety confirm when at least one item per group is kept', async () => {
    let confirmCalled = false;
    const prompt = makeMockPrompt({ multiselectResponse: [1] });
    prompt.confirm = async () => { confirmCalled = true; return true; };
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, prompt);
    assert.equal(confirmCalled, false);
    assert.equal(result.ops.length, 1);
  });

  it('produces one delete op when overlapping item is selected from multiple groups', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    // options: shared(0), a2(1), shared(2), b2(3); select both shared instances
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponse: [0, 2] }));
    const deleteIds = result.ops
      .filter((op): op is Extract<typeof op, { kind: 'delete_item' }> => op.kind === 'delete_item')
      .map(op => op.itemId);
    assert.equal(deleteIds.length, 1);
    assert.equal(deleteIds[0], 'shared');
    assert.equal(result.cancelled, false);
  });

  it('removes shared item from delete set when declining safety confirm for a group that contains it', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    // select shared(0) + b2(3): groupB loses all (shared+b2), groupA keeps a2
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 3],
      confirmResponse: false,
    }));
    // declining removes groupB items (shared, b2) from delete set — shared is gone even though groupA still has a2 kept
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, false);
  });

  it('deletes all overlapping items when safety confirm is accepted across groups', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    // select all: shared(0), a2(1), shared(2), b2(3) — both groups lose all
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 1, 2, 3],
      confirmResponse: true,
    }));
    const deleteIds = result.ops
      .filter((op): op is Extract<typeof op, { kind: 'delete_item' }> => op.kind === 'delete_item')
      .map(op => op.itemId);
    assert.deepEqual(new Set(deleteIds), new Set(['shared', 'a2', 'b2']));
    assert.equal(result.cancelled, false);
  });

  it('handles declining safety confirm when both overlapping groups lose all items', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    // select all — both groups lose all; decline safety confirm
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: [0, 1, 2, 3],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.cancelled, false);
  });

  it('handles a large number of duplicate groups correctly', async () => {
    const groupCount = 50;
    const findings: DuplicateFinding[] = [];
    const selectedIndices: number[] = [];
    for (let g = 0; g < groupCount; g++) {
      findings.push({
        category: 'duplicates',
        items: [
          makeItem({ id: `g${g}-a` }),
          makeItem({ id: `g${g}-b` }),
          makeItem({ id: `g${g}-c` }),
        ],
        key: `group-${g}`,
      });
      // select the last item in each group (index = g*3 + 2)
      selectedIndices.push(g * 3 + 2);
    }
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: selectedIndices,
    }));
    assert.equal(result.ops.length, groupCount);
    for (let g = 0; g < groupCount; g++) {
      const op = result.ops[g]!;
      assert.equal(op.kind, 'delete_item');
      if (op.kind === 'delete_item') assert.equal(op.itemId, `g${g}-c`);
    }
    assert.equal(result.cancelled, false);
  });

  it('triggers safety confirm for correct groups when many groups have all items selected', async () => {
    const groupCount = 20;
    const findings: DuplicateFinding[] = [];
    const selectedIndices: number[] = [];
    for (let g = 0; g < groupCount; g++) {
      findings.push({
        category: 'duplicates',
        items: [
          makeItem({ id: `g${g}-a` }),
          makeItem({ id: `g${g}-b` }),
        ],
        key: `group-${g}`,
      });
      // select all items in even groups (trigger safety), only second item in odd groups
      if (g % 2 === 0) {
        selectedIndices.push(g * 2, g * 2 + 1);
      } else {
        selectedIndices.push(g * 2 + 1);
      }
    }
    // 10 even groups lose all items; decline safety confirm → those 20 items removed
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponse: selectedIndices,
      confirmResponse: false,
    }));
    // only odd groups' selections survive (10 groups × 1 item each)
    assert.equal(result.ops.length, 10);
    for (const op of result.ops) {
      assert.equal(op.kind, 'delete_item');
      if (op.kind === 'delete_item') {
        const gNum = parseInt(op.itemId.match(/g(\d+)-b/)![1]!, 10);
        assert.equal(gNum % 2, 1);
      }
    }
    assert.equal(result.cancelled, false);
  });
});
