import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProcessAdapter } from '../../../src/adapters/process.js';

describe('ProcessAdapter', () => {
  describe('isTTY with ttyOverride', () => {
    it('uses ttyOverride when provided', () => {
      const adapter = createProcessAdapter(
        {},
        (code) => { throw new Error(`exit(${code})`); },
        undefined,
        { stdin: true, stdout: false, stderr: true },
      );

      assert.equal(adapter.isTTY('stdin'), true);
      assert.equal(adapter.isTTY('stdout'), false);
      assert.equal(adapter.isTTY('stderr'), true);
    });

    it('returns false from override when explicitly set to false', () => {
      const adapter = createProcessAdapter(
        {},
        (code) => { throw new Error(`exit(${code})`); },
        undefined,
        { stdin: false, stdout: false, stderr: false },
      );

      assert.equal(adapter.isTTY('stdin'), false);
      assert.equal(adapter.isTTY('stdout'), false);
      assert.equal(adapter.isTTY('stderr'), false);
    });

    it('falls back to process.stdin.isTTY when ttyOverride is not provided', () => {
      const adapter = createProcessAdapter(
        {},
        (code) => { throw new Error(`exit(${code})`); },
      );

      // These will match the actual process TTY status
      // We're just checking that the adapter doesn't throw and returns a boolean
      const result = adapter.isTTY('stdin');
      assert.equal(typeof result, 'boolean');
    });
  });
});
