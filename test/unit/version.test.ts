import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../../src/version.js';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

describe('VERSION', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof VERSION === 'string');
    assert.ok(VERSION.length > 0);
  });

  it('is a valid semver string', () => {
    assert.match(VERSION, SEMVER_RE);
  });

  it('matches package.json version', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.equal(VERSION, pkg.version);
  });
});
