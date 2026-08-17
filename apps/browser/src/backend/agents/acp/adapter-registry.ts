import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';
import { claudeCodeAcpAdapter } from '../providers/claude-code/acp-adapter';
import { codexAcpAdapter } from '../providers/codex/acp-adapter';
import { openCodeAcpAdapter } from '../providers/opencode/acp-adapter';
import type { AcpAdapter } from './adapter';

export const ACP_ADAPTERS = {
  codex: codexAcpAdapter,
  'claude-code': claudeCodeAcpAdapter,
  opencode: openCodeAcpAdapter,
} satisfies Record<AcpAdapter['id'], AcpAdapter>;

export function adapterForProviderType(
  typeId: ProviderInstanceTypeId,
): AcpAdapter | undefined {
  return Object.hasOwn(ACP_ADAPTERS, typeId)
    ? ACP_ADAPTERS[typeId as AcpAdapter['id']]
    : undefined;
}
