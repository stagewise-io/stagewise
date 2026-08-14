import fs from 'node:fs/promises';
import { parse } from 'smol-toml';

export const CODEX_WORKTREE_SETUP_CONFIG_RELATIVE_PATH =
  '.codex/environments/environment.toml';

type CodexSetupConfig = { script?: string } & Partial<
  Record<'darwin' | 'linux' | 'win32', { script?: string }>
>;

export async function readCodexSetupScript(
  configPath: string,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const config = parse(await fs.readFile(configPath, 'utf8'));
  const setup = config.setup as CodexSetupConfig | undefined;
  const platformKey =
    platform === 'darwin' || platform === 'win32' ? platform : 'linux';
  return setup?.[platformKey]?.script?.trim() || setup?.script?.trim() || null;
}
