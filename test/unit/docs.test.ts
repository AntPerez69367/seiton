import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ExitCode } from '../../src/exit-codes.js';

const ROOT = join(import.meta.dirname, '..', '..');

const COMMANDS = ['audit', 'resume', 'discard', 'report', 'doctor', 'config'];

function captureHelp(args: string[]): string {
  const result = execFileSync(
    process.execPath,
    ['--import', 'tsx', join(ROOT, 'src', 'bw-organize.ts'), ...args],
    { encoding: 'utf-8', cwd: ROOT, timeout: 10_000 },
  );
  return result.replace(/\r\n/g, '\n').trimEnd();
}

describe('help-text snapshots', () => {
  for (const cmd of COMMANDS) {
    it(`${cmd} --help matches snapshot`, () => {
      const actual = captureHelp([cmd, '--help']);
      const snapshotPath = join(ROOT, 'test', 'fixtures', 'help', `${cmd}.txt`);
      const expected = readFileSync(snapshotPath, 'utf-8').trimEnd();
      assert.equal(actual, expected, `${cmd} --help output differs from snapshot — run npm run gen:docs`);
    });
  }
});

describe('docs/commands/ completeness', () => {
  for (const cmd of COMMANDS) {
    it(`docs/commands/${cmd}.md exists`, () => {
      const docPath = join(ROOT, 'docs', 'commands', `${cmd}.md`);
      assert.ok(existsSync(docPath), `Missing docs/commands/${cmd}.md — run npm run gen:docs`);
    });
  }
});

describe('man page', () => {
  const manPath = join(ROOT, 'man', 'seiton.1');

  it('man/seiton.1 exists and is non-empty', () => {
    assert.ok(existsSync(manPath), 'man/seiton.1 does not exist — run npm run gen:docs');
    const stat = statSync(manPath);
    assert.ok(stat.size > 0, 'man/seiton.1 is empty');
  });

  it('man page starts with .TH SEITON', () => {
    const content = readFileSync(manPath, 'utf-8');
    assert.ok(content.startsWith('.TH SEITON'), 'man page must start with .TH SEITON');
  });

  it('EXIT STATUS section lists every ExitCode enum value', () => {
    const content = readFileSync(manPath, 'utf-8');
    const entries = Object.entries(ExitCode) as [string, number][];
    for (const [name, code] of entries) {
      assert.ok(
        content.includes(`.B ${code}`),
        `man page EXIT STATUS missing code ${code} (${name})`,
      );
    }
  });
});
