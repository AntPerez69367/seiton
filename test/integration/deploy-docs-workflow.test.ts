import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../helpers/run-cli.js';

const WORKFLOW_PATH = join(ROOT, '.github', 'workflows', 'deploy-docs.yml');
const RELEASE_PATH = join(ROOT, '.github', 'workflows', 'release.yml');

async function loadWorkflow(): Promise<string> {
  return readFile(WORKFLOW_PATH, 'utf8');
}

async function loadRelease(): Promise<string> {
  return readFile(RELEASE_PATH, 'utf8');
}

describe('deploy-docs workflow', () => {
  it('file exists and is non-empty', async () => {
    const content = await loadWorkflow();
    assert.ok(content.length > 0, 'workflow file should not be empty');
  });

  it('has a name field', async () => {
    const content = await loadWorkflow();
    assert.match(content, /^name:\s+.+/m, 'workflow must have a name field');
  });

  describe('triggers', () => {
    it('triggers on push to main', async () => {
      const content = await loadWorkflow();
      assert.match(content, /on:/, 'workflow must have an on: trigger');
      assert.match(content, /push:/, 'must trigger on push');
      assert.match(content, /branches:\s*\n\s+-\s+main/, 'must target main branch');
    });

    it('filters on website/** path', async () => {
      const content = await loadWorkflow();
      assert.match(
        content,
        /paths:\s*\n\s+-\s+["']?website\/\*\*["']?/,
        'must filter on website/** path',
      );
    });

    it('supports manual dispatch', async () => {
      const content = await loadWorkflow();
      assert.match(content, /workflow_dispatch/, 'must support workflow_dispatch');
    });
  });

  describe('permissions', () => {
    it('requests contents: read', async () => {
      const content = await loadWorkflow();
      assert.match(content, /contents:\s+read/, 'must have contents: read');
    });

    it('requests pages: write', async () => {
      const content = await loadWorkflow();
      assert.match(content, /pages:\s+write/, 'must have pages: write');
    });

    it('requests id-token: write for OIDC', async () => {
      const content = await loadWorkflow();
      assert.match(content, /id-token:\s+write/, 'must have id-token: write');
    });
  });

  describe('concurrency', () => {
    it('defines a concurrency group', async () => {
      const content = await loadWorkflow();
      assert.match(content, /concurrency:/, 'must have concurrency settings');
      assert.match(content, /group:\s+pages/, 'concurrency group should be "pages"');
    });

    it('does not cancel in-progress deployments', async () => {
      const content = await loadWorkflow();
      assert.match(
        content,
        /cancel-in-progress:\s+false/,
        'should not cancel in-progress deployments',
      );
    });
  });

  describe('build job', () => {
    it('has a build job', async () => {
      const content = await loadWorkflow();
      assert.match(content, /jobs:\s*\n\s+build:/, 'must have a build job');
    });

    it('uses actions/checkout@v4', async () => {
      const content = await loadWorkflow();
      assert.match(content, /uses:\s+actions\/checkout@v4/, 'must use checkout@v4');
    });

    it('uses actions/setup-node@v4 with .nvmrc', async () => {
      const content = await loadWorkflow();
      assert.match(content, /uses:\s+actions\/setup-node@v4/, 'must use setup-node@v4');
      assert.match(
        content,
        /node-version-file:\s+["']?\.nvmrc["']?/,
        'must use .nvmrc for node version',
      );
    });

    it('runs npm ci in website/ directory', async () => {
      const content = await loadWorkflow();
      assert.match(content, /run:\s+npm ci/, 'must run npm ci');
      assert.match(
        content,
        /working-directory:\s+website/,
        'npm ci must run in website directory',
      );
    });

    it('runs npm run build in website/ directory', async () => {
      const content = await loadWorkflow();
      assert.match(content, /run:\s+npm run build/, 'must run npm run build');
    });

    it('uploads pages artifact from website/build', async () => {
      const content = await loadWorkflow();
      assert.match(
        content,
        /uses:\s+actions\/upload-pages-artifact@v3/,
        'must use upload-pages-artifact@v3',
      );
      assert.match(
        content,
        /path:\s+website\/build/,
        'must upload from website/build',
      );
    });
  });

  describe('deploy job', () => {
    it('has a deploy job that depends on build', async () => {
      const content = await loadWorkflow();
      assert.match(content, /deploy:/, 'must have a deploy job');
      assert.match(content, /needs:\s+build/, 'deploy must depend on build');
    });

    it('targets github-pages environment', async () => {
      const content = await loadWorkflow();
      assert.match(
        content,
        /name:\s+github-pages/,
        'deploy must target github-pages environment',
      );
    });

    it('uses actions/deploy-pages@v4', async () => {
      const content = await loadWorkflow();
      assert.match(
        content,
        /uses:\s+actions\/deploy-pages@v4/,
        'must use deploy-pages@v4',
      );
    });
  });

  describe('convention consistency with release.yml', () => {
    it('uses same checkout action version as release.yml', async () => {
      const deploy = await loadWorkflow();
      const release = await loadRelease();

      const deployCheckout = deploy.match(/actions\/checkout@(v\d+)/);
      const releaseCheckout = release.match(/actions\/checkout@(v\d+)/);

      assert.ok(deployCheckout, 'deploy-docs must use actions/checkout');
      assert.ok(releaseCheckout, 'release must use actions/checkout');
      assert.equal(
        deployCheckout![1],
        releaseCheckout![1],
        'checkout action versions must match between workflows',
      );
    });

    it('uses same setup-node action version as release.yml', async () => {
      const deploy = await loadWorkflow();
      const release = await loadRelease();

      const deployNode = deploy.match(/actions\/setup-node@(v\d+)/);
      const releaseNode = release.match(/actions\/setup-node@(v\d+)/);

      assert.ok(deployNode, 'deploy-docs must use actions/setup-node');
      assert.ok(releaseNode, 'release must use actions/setup-node');
      assert.equal(
        deployNode![1],
        releaseNode![1],
        'setup-node action versions must match between workflows',
      );
    });

    it('both workflows reference .nvmrc for node version', async () => {
      const deploy = await loadWorkflow();
      const release = await loadRelease();

      assert.match(deploy, /\.nvmrc/, 'deploy-docs must reference .nvmrc');
      assert.match(release, /\.nvmrc/, 'release must reference .nvmrc');
    });
  });
});
