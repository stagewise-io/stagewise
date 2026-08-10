import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DiscoveredModel } from '@shared/karton-contracts/ui/shared-types';
import {
  resolveAcpEnvironment,
  resolveOpenCodeExecutable,
} from '../../acp/adapter';
import {
  createAcpProviderType,
  DEFAULT_ACP_MODEL_CAPABILITIES,
} from '../external-agent';

const execFileAsync = promisify(execFile);

const defaultModel: DiscoveredModel = {
  modelId: 'default',
  displayName: 'Default',
  description: 'Use the model selected by OpenCode.',
  capabilities: DEFAULT_ACP_MODEL_CAPABILITIES,
  recommended: true,
};

interface OpenCodeModelMetadata {
  providerID: string;
  name: string;
  limit?: { context?: number };
  cost?: { input?: number; output?: number };
  capabilities?: {
    reasoning?: boolean;
    attachment?: boolean;
    toolcall?: boolean;
    input?: Record<string, boolean>;
    output?: Record<string, boolean>;
  };
  variants?: Record<string, unknown>;
}

export function parseOpenCodeModels(output: string): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  for (const match of output.matchAll(/^(\S+)\r?\n(\{[\s\S]*?^\})/gm)) {
    try {
      const metadata = JSON.parse(match[2] ?? '') as OpenCodeModelMetadata;
      if (!metadata.providerID || !metadata.name) continue;
      const thinkingEfforts = Object.keys(metadata.variants ?? {});
      const providerName =
        metadata.providerID === 'opencode'
          ? 'OpenCode Zen'
          : metadata.providerID === 'opencode-go'
            ? 'OpenCode Go'
            : metadata.providerID;
      const input = metadata.capabilities?.input ?? {};
      const output = metadata.capabilities?.output ?? {};
      models.push({
        modelId: match[1] ?? '',
        displayName: `${metadata.name} · ${providerName}`,
        description: `Available through ${providerName}.`,
        contextWindow: metadata.limit?.context,
        pricing:
          metadata.cost?.input != null && metadata.cost.output != null
            ? {
                inputPerMillion: metadata.cost.input,
                outputPerMillion: metadata.cost.output,
              }
            : undefined,
        capabilities: {
          inputModalities: {
            text: input.text ?? true,
            audio: input.audio ?? false,
            image: input.image ?? false,
            video: input.video ?? false,
            file:
              (metadata.capabilities?.attachment ?? false) ||
              (input.pdf ?? false),
          },
          outputModalities: {
            text: output.text ?? true,
            audio: output.audio ?? false,
            image: output.image ?? false,
            video: output.video ?? false,
            file: output.pdf ?? false,
          },
          toolCalling: metadata.capabilities?.toolcall ?? true,
        },
        thinkingEnabled: metadata.capabilities?.reasoning ?? false,
        thinkingEfforts: thinkingEfforts.length ? thinkingEfforts : undefined,
        defaultThinkingEffort: thinkingEfforts.includes('medium')
          ? 'medium'
          : undefined,
      });
    } catch {}
  }
  return models;
}

async function discoverOpenCodeModels(): Promise<DiscoveredModel[]> {
  const shellEnv = (await resolveAcpEnvironment()) ?? {};
  const env = { ...process.env, ...shellEnv };
  const executable = await resolveOpenCodeExecutable(env);
  if (!executable) throw new Error('OpenCode is not installed.');
  const { stdout } = await execFileAsync(executable, ['models', '--verbose'], {
    encoding: 'utf8',
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
  const models = parseOpenCodeModels(stdout);
  if (!models.length) throw new Error('OpenCode returned no models.');
  return [defaultModel, ...models];
}

const providerType = createAcpProviderType('opencode', discoverOpenCodeModels);

export const opencodeProviderType = {
  ...providerType,
  refreshModels: discoverOpenCodeModels,
};
