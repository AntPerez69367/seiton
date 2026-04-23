import { parseConfig } from '../config/schema.js';
import { readConfigFile, writeConfigFile } from '../config/io.js';

export type ConfigSetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configSet(
  configFilePath: string,
  keyPath: string,
  value: string | undefined,
  unset: boolean,
): Promise<ConfigSetResult> {
  const read = await readConfigFile(configFilePath);
  let raw: Record<string, unknown>;
  if (read.ok) {
    raw = read.data;
  } else if (read.code === 'NOT_FOUND') {
    raw = { version: 1 };
  } else {
    return { ok: false, error: read.error };
  }

  const parts = keyPath.split('.');
  if (unset) {
    deleteNestedKey(raw, parts);
  } else if (value !== undefined) {
    const converted = convertValue(value);
    setNestedKey(raw, parts, converted);
  } else {
    return { ok: false, error: 'Either a value or --unset must be provided' };
  }

  const validation = parseConfig(raw);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    const path = issue?.path.length ? issue.path.join('.') : '(root)';
    return { ok: false, error: `Invalid config after change: ${path}: ${issue?.message}` };
  }

  return writeConfigFile(configFilePath, raw);
}

function convertValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n)) return n;
  return raw;
}

function setNestedKey(obj: Record<string, unknown>, parts: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function deleteNestedKey(obj: Record<string, unknown>, parts: string[]): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) return;
    current = current[key] as Record<string, unknown>;
  }
  delete current[parts[parts.length - 1]!];
}
