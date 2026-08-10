import { createAcpProviderType } from '../external-agent';
import { discoverCodexModels } from './models';

export const codexProviderType = createAcpProviderType(
  'codex',
  discoverCodexModels,
);
