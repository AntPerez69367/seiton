import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from '../../../src/commands/apply.js';
import type { PendingOp } from '../../../src/lib/domain/pending.js';
import { makeBwError, BwErrorCode } from '../../../src/lib/domain/types.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';

describe('applyOps', () => {
  it('returns zero applied for empty ops', async () => {
    const bw = makeFakeAdapter();
    const result = await applyOps([], 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.remaining.length, 0);
  });

  it('applies delete operations', async () => {
    const ops: PendingOp[] = [{ kind: 'delete_item', itemId: 'item-1' }];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
    assert.equal(result.failed.length, 0);
  });

  it('applies create_folder operations', async () => {
    const ops: PendingOp[] = [{ kind: 'create_folder', folderName: 'Test' }];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
  });

  it('applies assign_folder operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'folder-1', folderName: 'Test' },
    ];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
  });

  it('tracks failed operations', async () => {
    const ops: PendingOp[] = [{ kind: 'delete_item', itemId: 'item-1' }];
    const bw = makeFakeAdapter({
      deleteItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 1);
  });

  it('uses folder ID from create_folder for subsequent assigns', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'NewFolder' },
      { kind: 'assign_folder', itemId: 'item-1', folderId: null, folderName: 'NewFolder' },
    ];
    let editedPayload = '';
    const bw = makeFakeAdapter({
      editItem: async (_session, _itemId, encoded) => {
        editedPayload = Buffer.from(encoded, 'base64').toString();
        return { ok: true, data: undefined };
      },
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 2);
    const parsed = JSON.parse(editedPayload);
    assert.equal(parsed.folderId, 'new-id');
    assert.equal(parsed.id, 'item-1');
    assert.equal(parsed.name, 'Test Item');
  });

  it('fails assign_folder when getItem fails', async () => {
    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'missing-item', folderId: 'folder-1', folderName: 'Test' },
    ];
    const bw = makeFakeAdapter({
      getItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'not found') }),
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 1);
  });

  it('invokes onApplied callback for successful operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Folder1' },
      { kind: 'delete_item', itemId: 'item-1' },
      { kind: 'assign_folder', itemId: 'item-2', folderId: 'folder-1', folderName: 'Folder2' },
    ];
    const appliedOps: PendingOp[] = [];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw, undefined, (op) => {
      appliedOps.push(op);
    });
    assert.equal(appliedOps.length, 3);
    assert.equal(result.applied, 3);
    // Operations are processed by type: create_folder, then assign_folder, then delete_item
    assert.deepEqual(appliedOps[0], ops[0]); // create_folder
    assert.deepEqual(appliedOps[1], ops[2]); // assign_folder
    assert.deepEqual(appliedOps[2], ops[1]); // delete_item
  });

  it('does not invoke onApplied for failed operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Folder1' },
      { kind: 'delete_item', itemId: 'item-1' },
    ];
    const appliedOps: PendingOp[] = [];
    const bw = makeFakeAdapter({
      createFolder: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
      deleteItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
    });
    const result = await applyOps(ops, 'session', bw, undefined, (op) => {
      appliedOps.push(op);
    });
    assert.equal(appliedOps.length, 0);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 2);
  });
});
