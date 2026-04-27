import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, cpSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-layering.ts');
const TSX_LOADER = resolve(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

describe('import layering', () => {
  it('reports zero violations for the current codebase', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', SCRIPT],
      { cwd: ROOT },
    );
    assert.equal(stderr, '', 'expected no violations on stderr');
    assert.equal(stdout, '', 'expected no output on stdout');
  });
});

describe('import layering – negative paths', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'seiton-layering-'));
    mkdirSync(join(tmp, 'scripts'), { recursive: true });
    cpSync(SCRIPT, join(tmp, 'scripts', 'check-layering.ts'));
    writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeSrcFile(relPath: string, content: string): void {
    const full = join(tmp, relPath);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }

  async function runChecker(): Promise<{ code: number | null; stderr: string; stdout: string }> {
    const script = join(tmp, 'scripts', 'check-layering.ts');
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--import', TSX_LOADER, script],
        { cwd: tmp },
      );
      return { code: 0, stderr, stdout };
    } catch (err: unknown) {
      const e = err as { code?: number | null; stderr?: string; stdout?: string };
      return { code: e.code ?? null, stderr: e.stderr ?? '', stdout: e.stdout ?? '' };
    }
  }

  it('exits 1 when pure-lib imports node:fs', async () => {
    writeSrcFile('src/lib/analyze/bad.ts', "import { readFileSync } from 'node:fs';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:fs/);
    assert.match(stderr, /src\/lib\/analyze\/bad\.ts:1/);
  });

  it('exits 1 when pure-lib imports node:fs/promises', async () => {
    writeSrcFile('src/lib/dedup/bad.ts', "import { readFile } from 'node:fs/promises';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:fs/);
    assert.match(stderr, /src\/lib\/dedup\/bad\.ts:1/);
  });

  it('exits 1 when pure-lib imports node:child_process', async () => {
    writeSrcFile('src/lib/strength/bad.ts', "import { spawn } from 'node:child_process';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:child_process/);
  });

  it('exits 1 when pure-lib imports node:readline', async () => {
    writeSrcFile('src/lib/folders/bad.ts', "import readline from 'node:readline';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:readline/);
  });

  it('exits 1 when pure-lib imports src/lib/bw.ts', async () => {
    writeSrcFile('src/lib/analyze/bad.ts', "import { runBw } from '../bw.js';\n");
    writeSrcFile('src/lib/bw.ts', 'export function runBw() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import src\/lib\/bw\.ts/);
  });

  it('exits 1 when pure-lib imports src/commands/**', async () => {
    writeSrcFile('src/lib/domain/bad.ts', "import { audit } from '../../commands/audit.js';\n");
    writeSrcFile('src/commands/audit.ts', 'export function audit() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import src\/commands/);
  });

  it('exits 1 when pure-lib imports src/config/loader.ts', async () => {
    writeSrcFile('src/lib/analyze/bad.ts', "import { loadConfig } from '../../config/loader.js';\n");
    writeSrcFile('src/config/loader.ts', 'export function loadConfig() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import src\/config\/loader\.ts/);
  });

  it('exits 1 when bw.ts imports src/commands/**', async () => {
    writeSrcFile('src/lib/bw.ts', "import { audit } from '../commands/audit.js';\n");
    writeSrcFile('src/commands/audit.ts', 'export function audit() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /src\/lib\/bw\.ts may not import src\/commands/);
  });

  it('exits 1 when pending.ts imports src/commands/**', async () => {
    writeSrcFile('src/lib/pending.ts', "import { audit } from '../commands/audit.js';\n");
    writeSrcFile('src/commands/audit.ts', 'export function audit() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /src\/lib\/pending\.ts may not import src\/commands/);
  });

  it('exits 1 when config imports src/lib/bw.ts', async () => {
    writeSrcFile('src/config/bad.ts', "import { runBw } from '../lib/bw.js';\n");
    writeSrcFile('src/lib/bw.ts', 'export function runBw() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /src\/config\/\*\* may not import src\/lib\/bw\.ts/);
  });

  it('exits 1 when config imports src/commands/**', async () => {
    writeSrcFile('src/config/bad.ts', "import { audit } from '../commands/audit.js';\n");
    writeSrcFile('src/commands/audit.ts', 'export function audit() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /src\/config\/\*\* may not import src\/commands/);
  });

  it('exits 1 when src/lib/** imports src/commands/** (reverse rule)', async () => {
    writeSrcFile('src/lib/log.ts', "import { audit } from '../commands/audit.js';\n");
    writeSrcFile('src/commands/audit.ts', 'export function audit() {}\n');
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /src\/lib\/\*\* may not import src\/commands/);
  });

  it('reports multiple violations from a single file', async () => {
    writeSrcFile(
      'src/lib/analyze/bad.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { spawn } from 'node:child_process';",
        '',
      ].join('\n'),
    );
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:fs/);
    assert.match(stderr, /pure-lib may not import node:child_process/);
    const lines = stderr.trim().split('\n');
    assert.ok(lines.length >= 2, `expected at least 2 violation lines, got ${lines.length}`);
  });

  it('detects violations in dynamic imports', async () => {
    writeSrcFile(
      'src/lib/analyze/bad.ts',
      "const fs = await import('node:fs');\n",
    );
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:fs/);
  });

  it('detects violations in side-effect imports', async () => {
    writeSrcFile('src/lib/analyze/bad.ts', "import 'node:fs';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 1);
    assert.match(stderr, /pure-lib may not import node:fs/);
  });

  it('exits 0 when synthetic files have no violations', async () => {
    writeSrcFile('src/lib/analyze/ok.ts', "import { join } from 'node:path';\n");
    writeSrcFile('src/commands/audit.ts', "import { join } from 'node:path';\n");
    const { code, stderr } = await runChecker();
    assert.equal(code, 0);
    assert.equal(stderr, '');
  });

  it('stderr format matches file:line: description (imported specifier)', async () => {
    writeSrcFile('src/lib/analyze/bad.ts', "import { readFileSync } from 'node:fs';\n");
    const { stderr } = await runChecker();
    assert.match(
      stderr,
      /^src\/lib\/analyze\/bad\.ts:1: pure-lib may not import node:fs \(imported 'node:fs'\)\n$/,
    );
  });

  it('allows commands zone to import anything', async () => {
    writeSrcFile('src/commands/audit.ts', [
      "import { readFileSync } from 'node:fs';",
      "import { spawn } from 'node:child_process';",
      "import readline from 'node:readline';",
      '',
    ].join('\n'));
    const { code, stderr } = await runChecker();
    assert.equal(code, 0);
    assert.equal(stderr, '');
  });
});
