import type { ModelProvider } from './karton-contracts/ui/shared-types';

/** Match the native DeepSeek alias without rewriting stored or wire IDs. */
export function normalizeNativeModelAlias(
  modelId: string,
  vendor: ModelProvider | undefined,
): string {
  return vendor === 'deepseek' && modelId.toLowerCase() === 'deepseek-flash'
    ? 'deepseek-v4.1-flash'
    : modelId;
}
