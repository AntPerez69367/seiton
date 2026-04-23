import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configEdit } from '../../../src/commands/config-edit.js';

let tempDir: string;
let savedVisual: string | undefined;
let savedEditor: string | undefined;
let savedPath: string | undefined;
let exitZeroPath: string;
let exitOnePath: string;
let checkArgPath: string;
let fakeViPath: string;

function nodeEditor(scriptPath: string, ...extraArgs: string[]): string {
  const parts = [process.execPath, scriptPath, ...extraArgs];
  return parts.join(' ');
}

describe('configEdit', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seiton-config-edit-'));
    savedVisual = process.env['VISUAL'];
    savedEditor = process.env['EDITOR'];
    savedPath = process.env['PATH'];
    delete process.env['VISUAL'];

    exitZeroPath = join(tempDir, 'exit-zero.mjs');
    exitOnePath = join(tempDir, 'exit-one.mjs');
    checkArgPath = join(tempDir, 'check-arg.mjs');
    fakeViPath = join(tempDir, 'vi');
    await Promise.all([
      writeFile(exitZeroPath, 'process.exit(0);\n'),
      writeFile(exitOnePath, 'process.exit(1);\n'),
      writeFile(checkArgPath, 'if(process.argv[2]!=="test-arg")process.exit(2);process.exit(0);\n'),
      writeFile(fakeViPath, '#!/bin/sh\nexit 42\n', { mode: 0o755 }),
    ]);
    // Add tempDir to PATH so 'vi' resolves to our fake script
    process.env['PATH'] = `${tempDir}:${process.env['PATH'] || ''}`;
  });

  afterEach(async () => {
    if (savedVisual !== undefined) process.env['VISUAL'] = savedVisual;
    else delete process.env['VISUAL'];
    if (savedEditor !== undefined) process.env['EDITOR'] = savedEditor;
    else delete process.env['EDITOR'];
    if (savedPath !== undefined) process.env['PATH'] = savedPath;
    else delete process.env['PATH'];
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reports error when editor binary does not exist', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = '/nonexistent/editor-binary-that-does-not-exist';
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Failed to launch editor'));
      assert.ok(result.error.includes('/nonexistent/editor-binary-that-does-not-exist'));
    }
  });

  it('creates config file with template when it does not exist', async () => {
    const configPath = join(tempDir, 'subdir', 'config.json');
    process.env['EDITOR'] = nodeEditor(exitZeroPath);
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as { version: number };
    assert.equal(parsed.version, 1);
  });

  it('returns ok when editor exits 0', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(exitZeroPath);
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('reports error when editor exits non-zero', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(exitOnePath);
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('exited with code'));
    }
  });

  it('reports error when editor returns with a signal', async () => {
    const configPath = join(tempDir, 'config.json');
    const scriptPath = join(tempDir, 'kill-self.sh');
    await writeFile(scriptPath, '#!/bin/bash\nkill -TERM $$\nwait\n', { mode: 0o755 });
    process.env['EDITOR'] = scriptPath;
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('terminated by signal'));
    }
  });

  it('splits editor string on whitespace for arguments', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(checkArgPath, 'test-arg');
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('uses VISUAL over EDITOR and passes multiple arguments', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['VISUAL'] = nodeEditor(exitZeroPath);
    process.env['EDITOR'] = '/nonexistent/should-not-be-used';
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('reports error when config file is not valid JSON after editing', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(exitZeroPath);
    await configEdit(configPath);
    await writeFile(configPath, 'not valid json {]', 'utf-8');
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('not valid JSON'));
    }
  });

  it('reports error when config fails Zod schema validation after editing', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(exitZeroPath);
    await configEdit(configPath);
    await writeFile(configPath, '{"core": {}}', 'utf-8');
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Config is invalid'));
    }
  });

  it('returns a clean error for non-ENOENT readFile failures from ensureConfigFileExists', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = nodeEditor(exitZeroPath);
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });
    await chmod(dir, 0o000);

    try {
      const result = await configEdit(configPath);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes('Failed to read config'));
        assert.ok(result.error.includes('EACCES') || result.error.toLowerCase().includes('permission'));
      }
    } finally {
      await chmod(dir, 0o755);
    }
  });

  it('trims whitespace from VISUAL and uses the result', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['VISUAL'] = `   ${nodeEditor(exitZeroPath)}   `;
    process.env['EDITOR'] = '/nonexistent/should-not-be-used';
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('trims whitespace from EDITOR and uses the result', async () => {
    const configPath = join(tempDir, 'config.json');
    delete process.env['VISUAL'];
    process.env['EDITOR'] = `\t\n  ${nodeEditor(exitZeroPath)}  \n\t`;
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('falls back to vi when both VISUAL and EDITOR are whitespace-only or empty', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['VISUAL'] = '   ';
    process.env['EDITOR'] = '\t';
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      // The error should mention 'vi' (which is what it falls back to)
      // and report that it exited with code 42 (from our fake vi script)
      assert.ok(result.error.includes('vi'));
      assert.ok(result.error.includes('exited with code 42'));
    }
  });
});
