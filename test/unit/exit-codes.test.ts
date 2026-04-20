import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../../src/exit-codes.js';

describe('ExitCode', () => {
  it('maps SUCCESS to 0', () => {
    assert.equal(ExitCode.SUCCESS, 0);
  });

  it('maps GENERAL_ERROR to 1', () => {
    assert.equal(ExitCode.GENERAL_ERROR, 1);
  });

  it('maps USAGE to BSD sysexits EX_USAGE (64)', () => {
    assert.equal(ExitCode.USAGE, 64);
  });

  it('maps UNAVAILABLE to BSD sysexits EX_UNAVAILABLE (69)', () => {
    assert.equal(ExitCode.UNAVAILABLE, 69);
  });

  it('maps CANT_CREATE to BSD sysexits EX_CANTCREAT (73)', () => {
    assert.equal(ExitCode.CANT_CREATE, 73);
  });

  it('maps NO_PERMISSION to BSD sysexits EX_NOPERM (77)', () => {
    assert.equal(ExitCode.NO_PERMISSION, 77);
  });

  it('maps USER_INTERRUPT to 128 + SIGINT (130)', () => {
    assert.equal(ExitCode.USER_INTERRUPT, 130);
  });

  it('contains exactly the expected number of codes', () => {
    const keys = Object.keys(ExitCode);
    assert.equal(keys.length, 9);
  });

  it('has no duplicate values', () => {
    const values = Object.values(ExitCode);
    const unique = new Set(values);
    assert.equal(unique.size, values.length);
  });

  it('all values are non-negative integers', () => {
    for (const [key, value] of Object.entries(ExitCode)) {
      assert.equal(typeof value, 'number', `${key} should be a number`);
      assert.ok(Number.isInteger(value), `${key} should be an integer`);
      assert.ok(value >= 0, `${key} should be non-negative`);
    }
  });
});
