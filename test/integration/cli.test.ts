import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');
const ERROR_FIXTURE = join(ROOT, 'test', 'integration', 'fixtures', 'cli-parseargs-error.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[] = []): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

describe('CLI entry point', () => {
  describe('--version flag', () => {
    it('prints the version string to stdout and exits 0', async () => {
      const { stdout, exitCode } = await runCli(['--version']);
      const { VERSION } = await import('../../src/version.js');
      assert.equal(stdout.trim(), VERSION);
      assert.equal(exitCode, 0);
    });

    it('prints the version string with -V short flag', async () => {
      const { stdout, exitCode } = await runCli(['-V']);
      const { VERSION } = await import('../../src/version.js');
      assert.equal(stdout.trim(), VERSION);
      assert.equal(exitCode, 0);
    });
  });

  describe('--help flag', () => {
    it('prints help text to stdout and exits 0', async () => {
      const { stdout, exitCode } = await runCli(['--help']);
      assert.ok(stdout.includes('seiton'));
      assert.ok(stdout.includes('Usage:'));
      assert.ok(stdout.includes('Commands:'));
      assert.ok(stdout.includes('Global Flags:'));
      assert.equal(exitCode, 0);
    });

    it('prints help text with -h short flag', async () => {
      const { stdout, exitCode } = await runCli(['-h']);
      assert.ok(stdout.includes('Usage:'));
      assert.equal(exitCode, 0);
    });

    it('includes the version in help output', async () => {
      const { stdout } = await runCli(['--help']);
      const { VERSION } = await import('../../src/version.js');
      assert.ok(stdout.includes(`seiton v${VERSION}`));
    });
  });

  describe('default (no arguments)', () => {
    it('prints help text to stdout and exits 0', async () => {
      const { stdout, exitCode } = await runCli([]);
      assert.ok(stdout.includes('Usage:'));
      assert.ok(stdout.includes('Commands:'));
      assert.equal(exitCode, 0);
    });

    it('produces identical output to --help', async () => {
      const [defaultResult, helpResult] = await Promise.all([
        runCli([]),
        runCli(['--help']),
      ]);
      assert.equal(defaultResult.stdout, helpResult.stdout);
    });
  });

  describe('invalid-argument error path', () => {
    // With strict: false in parseArgs, the catch block in bw-organize.ts is
    // unreachable from normal CLI input. This test exercises a fixture that
    // replays the exact error-path logic (stderr message + ExitCode.USAGE)
    // to verify the contract: exit 64 with a helpful stderr message.
    it('error fixture exits 64 and writes guidance to stderr', async () => {
      try {
        await execFileAsync(
          process.execPath,
          ['--import', 'tsx', ERROR_FIXTURE],
          { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
        );
        assert.fail('Expected process to exit with non-zero code');
      } catch (err: unknown) {
        const e = err as { stdout: string; stderr: string; code: number };
        assert.equal(e.code, 64, 'ExitCode.USAGE should be 64');
        assert.ok(e.stderr.includes('invalid arguments'));
        assert.ok(e.stderr.includes('--help'));
      }
    });
  });
});
