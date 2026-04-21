import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskPassword, maskPartial } from '../../../src/ui/mask.js';

describe('maskPassword', () => {
  it('masks all characters with default char', () => {
    assert.equal(maskPassword('hello'), '•••••');
  });

  it('masks all characters with custom char', () => {
    assert.equal(maskPassword('hello', '*'), '*****');
  });

  it('returns empty string for empty input', () => {
    assert.equal(maskPassword(''), '');
  });

  it('handles single character', () => {
    assert.equal(maskPassword('a'), '•');
  });
});

describe('maskPartial', () => {
  it('reveals last N characters', () => {
    assert.equal(maskPartial('password', 2), '••••••rd');
  });

  it('masks entirely when password is shorter than reveal count', () => {
    assert.equal(maskPartial('ab', 5), '••');
  });

  it('reveals nothing when revealCount is 0', () => {
    assert.equal(maskPartial('hello', 0), '•••••');
  });

  it('uses custom mask character', () => {
    assert.equal(maskPartial('secret', 2, '#'), '####et');
  });
});
