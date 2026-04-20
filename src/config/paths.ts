import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

export function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export function resolveConfigHome(): string {
  if (process.env['XDG_CONFIG_HOME']) {
    return expandTilde(process.env['XDG_CONFIG_HOME']);
  }
  const home = process.env['HOME'] ?? homedir();
  return join(expandTilde(home), '.config');
}

export interface ConfigPathOptions {
  readonly cliConfigPath?: string;
  readonly envConfigPath?: string;
}

/**
 * Returns the ordered discovery stack for config file locations.
 * First match wins. `--config` and `$SEITON_CONFIG` are hard-fail
 * (caller must error if file is missing), the rest are soft (skip if absent).
 */
export function configDiscoveryStack(opts: ConfigPathOptions = {}): readonly ConfigCandidate[] {
  const home = process.env['HOME'] ?? homedir();
  const candidates: ConfigCandidate[] = [];

  if (opts.cliConfigPath) {
    candidates.push({ path: resolve(expandTilde(opts.cliConfigPath)), hardFail: true, source: '--config' });
    return candidates;
  }

  if (opts.envConfigPath) {
    candidates.push({ path: resolve(expandTilde(opts.envConfigPath)), hardFail: true, source: '$SEITON_CONFIG' });
    return candidates;
  }

  const configHome = resolveConfigHome();
  const xdgIsSet = process.env['XDG_CONFIG_HOME'] !== undefined && process.env['XDG_CONFIG_HOME'] !== '';
  const xdgCandidatePath = join(configHome, 'seiton', 'config.json');
  const homeConfigPath = join(expandTilde(home), '.config', 'seiton', 'config.json');

  candidates.push({
    path: xdgCandidatePath,
    hardFail: false,
    source: xdgIsSet ? '$XDG_CONFIG_HOME' : '$HOME/.config',
  });

  if (xdgCandidatePath !== homeConfigPath) {
    candidates.push({ path: homeConfigPath, hardFail: false, source: '$HOME/.config' });
  }

  candidates.push({ path: join(expandTilde(home), '.seitonrc.json'), hardFail: false, source: '$HOME/.seitonrc.json' });

  return candidates;
}

export interface ConfigCandidate {
  readonly path: string;
  readonly hardFail: boolean;
  readonly source: string;
}
