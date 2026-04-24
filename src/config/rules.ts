import { readConfigFile, writeConfigFile, type WriteConfigResult } from './io.js';
import type { Logger } from '../adapters/logging.js';
import type { CustomRuleEntry } from '../lib/folders/builtins.js';

export type { CustomRuleEntry };

export async function addCustomRule(
  configFilePath: string,
  rule: CustomRuleEntry,
  logger?: Logger,
): Promise<WriteConfigResult> {
  const readResult = await readConfigFile(configFilePath);

  let data: Record<string, unknown>;
  if (readResult.ok) {
    data = readResult.data;
  } else if (readResult.code === 'NOT_FOUND') {
    data = { version: 1 };
  } else {
    return { ok: false, error: readResult.error };
  }

  const folders = ensureObject(data, 'folders');
  const existingRules = ensureArray(folders, 'custom_rules');

  existingRules.push({ folder: rule.folder, keywords: [...rule.keywords] });
  folders['custom_rules'] = existingRules;
  data['folders'] = folders;

  logger?.info('config: adding custom rule', { folder: rule.folder });
  return writeConfigFile(configFilePath, data);
}

function ensureObject(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const val = parent[key];
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function ensureArray(
  parent: Record<string, unknown>,
  key: string,
): unknown[] {
  const val = parent[key];
  if (Array.isArray(val)) return [...val];
  return [];
}
