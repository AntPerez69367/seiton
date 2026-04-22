import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type WriteConfigResult =
  | { ok: true }
  | { ok: false; error: string };

export type ReadConfigResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: 'NOT_FOUND' | 'READ_ERROR' | 'PARSE_ERROR'; error: string };

export async function readConfigFile(configFilePath: string): Promise<ReadConfigResult> {
  let content: string;
  try {
    content = await readFile(configFilePath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      return { ok: false, code: 'NOT_FOUND', error: `Config file not found: ${configFilePath}` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'READ_ERROR', error: `Failed to read config: ${msg}` };
  }

  try {
    return { ok: true, data: JSON.parse(content) as Record<string, unknown> };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'PARSE_ERROR', error: `Failed to parse config: ${msg}` };
  }
}

export async function writeConfigFile(
  configFilePath: string,
  data: unknown,
): Promise<WriteConfigResult> {
  try {
    await mkdir(dirname(configFilePath), { recursive: true });
    await writeFile(configFilePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to write config: ${msg}` };
  }
  return { ok: true };
}
