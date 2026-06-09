import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import type { ExternalCliAgentKind } from '@shared/karton-contracts/ui/agent';

export type ExecutableAvailability = {
  available: boolean;
  executablePath: string | null;
};

export type ExternalCliAgentAvailability = Record<
  ExternalCliAgentKind,
  ExecutableAvailability
>;

export type FindExecutableOptions = {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  access?: typeof fs.access;
};

const EXTERNAL_CLI_AGENT_KINDS = [
  'claude',
  'codex',
] as const satisfies readonly ExternalCliAgentKind[];

function getEnvValue(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (env[key]) return env[key];

  const lowerKey = key.toLowerCase();
  const matchingKey = Object.keys(env).find(
    (candidate) => candidate.toLowerCase() === lowerKey,
  );
  return matchingKey ? env[matchingKey] : undefined;
}

function getWindowsExecutableCandidates(
  executableName: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string[] {
  const pathext = getEnvValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD';
  const extensions = pathext
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean);

  const lowerExecutableName = executableName.toLowerCase();
  const alreadyHasExecutableExtension = extensions.some((extension) =>
    lowerExecutableName.endsWith(extension.toLowerCase()),
  );

  if (alreadyHasExecutableExtension) {
    return [executableName];
  }

  return [
    executableName,
    ...extensions.map((extension) => `${executableName}${extension}`),
  ];
}

async function isExecutableFile(
  candidatePath: string,
  platform: NodeJS.Platform,
  access: typeof fs.access,
): Promise<boolean> {
  try {
    const mode = platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK;
    await access(candidatePath, mode);
    return true;
  } catch {
    return false;
  }
}

export async function findExecutableOnPath(
  executableName: string,
  options: FindExecutableOptions,
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const access = options.access ?? fs.access;
  const pathValue = getEnvValue(options.env, 'PATH');
  if (!pathValue) return null;

  const pathListDelimiter = platform === 'win32' ? ';' : path.delimiter;
  const pathEntries = pathValue
    .split(pathListDelimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const executableCandidates =
    platform === 'win32'
      ? getWindowsExecutableCandidates(executableName, options.env)
      : [executableName];

  for (const pathEntry of pathEntries) {
    for (const executableCandidate of executableCandidates) {
      const candidatePath = path.join(pathEntry, executableCandidate);
      if (await isExecutableFile(candidatePath, platform, access)) {
        return candidatePath;
      }
    }
  }

  return null;
}

export async function getExternalCliAgentAvailability(
  resolvedEnvPromise: Promise<Record<string, string> | null>,
): Promise<ExternalCliAgentAvailability> {
  const resolvedEnv = await resolvedEnvPromise.catch(() => null);
  const env = {
    ...process.env,
    ...(resolvedEnv ?? {}),
  };

  const [claudePath, codexPath] = await Promise.all(
    EXTERNAL_CLI_AGENT_KINDS.map((kind) => findExecutableOnPath(kind, { env })),
  );

  return {
    claude: {
      available: claudePath !== null,
      executablePath: claudePath,
    },
    codex: {
      available: codexPath !== null,
      executablePath: codexPath,
    },
  };
}
