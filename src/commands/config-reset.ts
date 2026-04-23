import { readConfigFile, writeConfigFile } from '../config/io.js';

export type ConfigResetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configReset(
  configFilePath: string,
  keepCustomRules: boolean,
): Promise<ConfigResetResult> {
  let customRules: unknown[] = [];

  if (keepCustomRules) {
    const read = await readConfigFile(configFilePath);
    if (read.ok) {
      const folders = read.data['folders'] as Record<string, unknown> | undefined;
      if (folders && Array.isArray(folders['custom_rules'])) {
        customRules = folders['custom_rules'] as unknown[];
      }
    }
  }

  const defaults: Record<string, unknown> = { version: 1 };
  if (customRules.length > 0) {
    defaults['folders'] = { custom_rules: customRules };
  }

  return writeConfigFile(configFilePath, defaults);
}
