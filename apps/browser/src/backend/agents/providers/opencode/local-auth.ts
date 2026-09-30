import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveAcpEnvironment } from '../../acp/adapter';

export interface OpenCodeAuthCredential {
  type?: string;
  key?: string;
}

/**
 * Resolving the login-shell environment spawns a shell, so it is memoized
 * for the process lifetime — detection runs on every render of a plan card.
 */
let environmentPromise: Promise<NodeJS.ProcessEnv> | undefined;

function resolveEnvironment(): Promise<NodeJS.ProcessEnv> {
  environmentPromise ??= resolveAcpEnvironment().then((shellEnv) => ({
    ...process.env,
    ...(shellEnv ?? {}),
  }));
  return environmentPromise;
}

export function authFilePath(env: NodeJS.ProcessEnv): string {
  const dataHome = env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'auth.json');
}

/** Parse the OpenCode CLI auth.json contents into a credential map. */
export function parseOpenCodeAuthCredentials(
  contents: string,
): Record<string, OpenCodeAuthCredential> {
  try {
    const parsed = JSON.parse(contents) as Record<
      string,
      OpenCodeAuthCredential
    >;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function readOpenCodeAuthCredentials(
  env: NodeJS.ProcessEnv,
): Promise<Record<string, OpenCodeAuthCredential>> {
  try {
    const contents = env.OPENCODE_AUTH_CONTENT
      ? env.OPENCODE_AUTH_CONTENT
      : await readFile(authFilePath(env), 'utf8');
    return parseOpenCodeAuthCredentials(contents);
  } catch {
    return {};
  }
}

/**
 * Resolve a stored API key for a provider ID (e.g. `opencode-go`).
 * Falls back to the memoized login-shell environment when none is given.
 */
export async function getLocalOpenCodeApiKey(
  providerId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const credentials = await readOpenCodeAuthCredentials(
    env ?? (await resolveEnvironment()),
  );
  const credential = credentials[providerId];
  // auth.json is user-controlled: a valid JSON file can hold a non-string key.
  return credential?.type === 'api' && typeof credential.key === 'string'
    ? credential.key
    : undefined;
}
