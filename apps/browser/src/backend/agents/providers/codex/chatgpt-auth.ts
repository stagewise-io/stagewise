import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { CodexAppServerClient } from './app-server-client';

export interface CodexChatGptAuth {
  accessToken: string;
  accountId?: string;
}

type CodexAuthFile = {
  tokens?: {
    access_token?: unknown;
    account_id?: unknown;
  };
};

const TOKEN_REFRESH_SKEW_MS = 60_000;
let refreshPromise: Promise<void> | undefined;

function authFilePath(): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  return nodePath.join(
    codexHome || nodePath.join(homedir(), '.codex'),
    'auth.json',
  );
}

function jwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return undefined;
    return JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function parseCodexChatGptAuth(input: unknown): CodexChatGptAuth {
  const file = input as CodexAuthFile;
  const accessToken = file?.tokens?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error(
      'Codex is not signed in with ChatGPT. Run `codex login` first.',
    );
  }

  const payload = jwtPayload(accessToken);
  const authClaims = payload?.['https://api.openai.com/auth'] as
    | Record<string, unknown>
    | undefined;
  const storedAccountId = file.tokens?.account_id;
  const claimedAccountId = authClaims?.chatgpt_account_id;
  const accountId =
    typeof storedAccountId === 'string' && storedAccountId
      ? storedAccountId
      : typeof claimedAccountId === 'string' && claimedAccountId
        ? claimedAccountId
        : undefined;

  return { accessToken, accountId };
}

function tokenNeedsRefresh(accessToken: string): boolean {
  const expiresAt = jwtPayload(accessToken)?.exp;
  return (
    typeof expiresAt === 'number' &&
    expiresAt * 1000 <= Date.now() + TOKEN_REFRESH_SKEW_MS
  );
}

async function readAuth(): Promise<CodexChatGptAuth> {
  let contents: string;
  try {
    contents = await readFile(authFilePath(), 'utf8');
  } catch (error) {
    throw new Error(
      'Could not read Codex authentication. Run `codex login` first.',
      { cause: error },
    );
  }
  try {
    return parseCodexChatGptAuth(JSON.parse(contents) as unknown);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error('Codex authentication data is invalid.', {
      cause: error,
    });
  }
}

async function refreshAuth(): Promise<void> {
  const client = new CodexAppServerClient(console);
  try {
    await client.refreshChatGptAccount();
  } finally {
    client.close();
  }
}

export async function getCodexChatGptAuth(): Promise<CodexChatGptAuth> {
  let auth = await readAuth();
  if (!tokenNeedsRefresh(auth.accessToken)) return auth;

  refreshPromise ??= refreshAuth().finally(() => {
    refreshPromise = undefined;
  });
  await refreshPromise;

  auth = await readAuth();
  if (tokenNeedsRefresh(auth.accessToken)) {
    throw new Error('Codex ChatGPT authentication could not be refreshed.');
  }
  return auth;
}
