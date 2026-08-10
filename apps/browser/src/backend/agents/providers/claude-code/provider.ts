import type { DiscoveredModel } from '@shared/karton-contracts/ui/shared-types';
import {
  createAcpProviderType,
  DEFAULT_ACP_MODEL_CAPABILITIES,
} from '../external-agent';

const thinking: Pick<
  DiscoveredModel,
  'thinkingEnabled' | 'thinkingEfforts' | 'defaultThinkingEffort'
> = {
  thinkingEnabled: true,
  thinkingEfforts: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultThinkingEffort: 'default',
};

function model(
  modelId: string,
  displayName: string,
  description: string,
  contextWindow = 200_000,
): DiscoveredModel {
  return {
    modelId,
    displayName,
    description,
    contextWindow,
    capabilities: DEFAULT_ACP_MODEL_CAPABILITIES,
    ...thinking,
  };
}

const models: DiscoveredModel[] = [
  {
    ...model('default', 'Default', 'Use the model selected by Claude Code.'),
    recommended: true,
  },
  model('sonnet', 'Sonnet', 'Claude Code Sonnet alias.'),
  model(
    'opus[1m]',
    'Opus (1M)',
    'Claude Code Opus alias with the one-million-token context.',
    1_000_000,
  ),
  model('haiku', 'Haiku', 'Claude Code Haiku alias.'),
];

export const claudeCodeProviderType = createAcpProviderType(
  'claude-code',
  async () => models,
);
