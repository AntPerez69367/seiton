import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfigFile, writeConfigFile } from '../../../src/config/io.js';

describe('readConfigFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seiton-io-read-'));
  });

  afterEach(async () => {
    await chmod(tempDir, 0o755).catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns parsed data for a valid JSON file', async () => {
    const p = join(tempDir, 'config.json');
    await writeFile(p, JSON.stringify({ version: 1, core: { output_format: 'text' } }));
    const result = await readConfigFile(p);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data['version'], 1);
      assert.deepEqual(result.data['core'], { output_format: 'text' });
    }
  });

  it('returns NOT_FOUND when the file does not exist', async () => {
    const result = await readConfigFile(join(tempDir, 'missing.json'));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'NOT_FOUND');
      assert.match(result.error, /not found/i);
    }
  });

  it('returns PARSE_ERROR for invalid JSON', async () => {
    const p = join(tempDir, 'bad.json');
    await writeFile(p, '{not valid json');
    const result = await readConfigFile(p);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'PARSE_ERROR');
      assert.match(result.error, /parse/i);
    }
  });

  it('returns READ_ERROR for non-ENOENT filesystem errors', async () => {
    const p = join(tempDir, 'config.json');
    await writeFile(p, '{}');
    await chmod(tempDir, 0o000);
    try {
      const result = await readConfigFile(p);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, 'READ_ERROR');
        assert.match(result.error, /read/i);
      }
    } finally {
      await chmod(tempDir, 0o755);
    }
  });

  it('parses arrays and nested structures', async () => {
    const p = join(tempDir, 'config.json');
    const value = { version: 1, folders: { custom_rules: [{ match: 'a' }, { match: 'b' }] } };
    await writeFile(p, JSON.stringify(value));
    const result = await readConfigFile(p);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data, value);
    }
  });
});

describe('writeConfigFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seiton-io-write-'));
  });

  afterEach(async () => {
    await chmod(tempDir, 0o755).catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes JSON with 2-space indent and a trailing newline', async () => {
    const p = join(tempDir, 'out.json');
    const result = await writeConfigFile(p, { version: 1, nested: { key: 'value' } });
    assert.equal(result.ok, true);
    const content = await readFile(p, 'utf-8');
    assert.equal(content, `${JSON.stringify({ version: 1, nested: { key: 'value' } }, null, 2)}\n`);
    assert.ok(content.endsWith('\n'));
  });

  it('writes the file with 0o600 permissions', async () => {
    const p = join(tempDir, 'out.json');
    await writeConfigFile(p, { version: 1 });
    const info = await stat(p);
    assert.equal(info.mode & 0o777, 0o600);
  });

  it('creates missing parent directories', async () => {
    const p = join(tempDir, 'nested', 'deep', 'out.json');
    const result = await writeConfigFile(p, { version: 1 });
    assert.equal(result.ok, true);
    const content = await readFile(p, 'utf-8');
    assert.equal(JSON.parse(content).version, 1);
  });

  it('overwrites an existing file', async () => {
    const p = join(tempDir, 'out.json');
    await writeFile(p, JSON.stringify({ version: 0, stale: true }));
    const result = await writeConfigFile(p, { version: 1 });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(await readFile(p, 'utf-8'));
    assert.equal(parsed.version, 1);
    assert.equal(parsed.stale, undefined);
  });

  it('returns ok:false with a clean error when the directory is not writable', async () => {
    const lockedDir = join(tempDir, 'locked');
    await mkdir(lockedDir, { recursive: true });
    await chmod(lockedDir, 0o555);
    try {
      const result = await writeConfigFile(join(lockedDir, 'out.json'), { version: 1 });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.match(result.error, /Failed to write config/);
      }
    } finally {
      await chmod(lockedDir, 0o755);
    }
  });

  it('round-trips through readConfigFile', async () => {
    const p = join(tempDir, 'out.json');
    const value = { version: 1, folders: { custom_rules: [{ match: 'work' }] } };
    await writeConfigFile(p, value);
    const result = await readConfigFile(p);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data, value);
    }
  });
});
