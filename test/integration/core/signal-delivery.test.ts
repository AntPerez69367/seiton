import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHILD_SCRIPT = join(import.meta.dirname, '..', '..', 'helpers', 'signal-test-child.ts');

function spawnChild(markerPath: string): ReturnType<typeof spawn> {
  return spawn(process.execPath, ['--import', 'tsx/esm', CHILD_SCRIPT, markerPath], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env },
  });
}

function waitForReady(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.stdout!.off('data', onData);
      reject(new Error('Child did not become ready'));
    }, 5000);
    const onData = (data: Buffer) => {
      if (data.toString().includes('READY')) {
        clearTimeout(timeout);
        child.stdout!.off('data', onData);
        resolve();
      }
    };
    child.stdout!.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timeout);
      child.stdout!.off('data', onData);
      reject(err);
    });
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

describe('Signal delivery', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-signal-test-'));
  });

  it('runs cleanup handlers on SIGINT and exits with code 130', async () => {
    const markerPath = join(tmp, 'sigint-marker.txt');
    const child = spawnChild(markerPath);

    await waitForReady(child);
    child.kill('SIGINT');

    const { code } = await waitForExit(child);
    assert.equal(code, 130);

    const marker = await readFile(markerPath, 'utf-8');
    assert.equal(marker, 'cleanup-ran');
  });

  it('runs cleanup handlers on SIGTERM and exits with code 143', async () => {
    const markerPath = join(tmp, 'sigterm-marker.txt');
    const child = spawnChild(markerPath);

    await waitForReady(child);
    child.kill('SIGTERM');

    const { code } = await waitForExit(child);
    assert.equal(code, 143);

    const marker = await readFile(markerPath, 'utf-8');
    assert.equal(marker, 'cleanup-ran');
  });

  it('only runs cleanup once even with multiple rapid signals', async () => {
    const markerPath = join(tmp, 'multi-signal-marker.txt');
    const child = spawnChild(markerPath);

    await waitForReady(child);
    child.kill('SIGINT');
    child.kill('SIGINT');

    const { code } = await waitForExit(child);
    assert.equal(code, 130);

    const marker = await readFile(markerPath, 'utf-8');
    assert.equal(marker, 'cleanup-ran');
  });
});
