import { createAcpProviderType } from '../external-agent';
import { discoverCodexModels } from './models';
import { getCodexUsageLimits } from './usage';

export const codexProviderType = {
  ...createAcpProviderType('codex', discoverCodexModels),
  getUsageLimits: getCodexUsageLimits,
};
