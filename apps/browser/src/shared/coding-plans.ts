import type { ModelProvider } from './karton-contracts/ui/shared-types';

/**
 * Tier-A "bring your own subscription" coding plans.
 *
 * Each plan maps to a built-in provider. Connecting a plan means:
 *   1. validate the user-supplied API key against the provider,
 *   2. encrypt+store it in providerConfigs[provider].encryptedApiKey,
 *   3. set providerConfigs[provider].mode = 'official'.
 *
 * Disconnecting reuses the existing `clearProviderApiKey` procedure
 * and sets `mode` back to `'stagewise'` via `updatePreferences`.
 */
export type CodingPlanId =
  | 'glm-coding-plan'
  | 'kimi-plan'
  | 'qwen-plan'
  | 'minimax-plan';

export type CodingPlan = {
  id: CodingPlanId;
  /** Built-in provider this plan maps to. One plan = one provider. */
  provider: ModelProvider;
  displayName: string;
  tagline: string;
  /** Public page to purchase/upgrade the subscription. */
  subscribeUrl: string;
  /** Deep link to the provider dashboard where the user copies the key. */
  apiKeyUrl: string;
  /** Short help text rendered below the API-key input. */
  helpText: string;
  /** Optional regex the UI uses for clipboard auto-detection. */
  apiKeyPattern?: string;
  /** Featured model IDs (must exist in availableModels) — for card copy. */
  featuredModelIds: string[];
};

export const CODING_PLANS: Record<CodingPlanId, CodingPlan> = {
  'glm-coding-plan': {
    id: 'glm-coding-plan',
    provider: 'z-ai',
    displayName: 'GLM Coding Plan',
    tagline: 'GLM-5.1, 5V-Turbo via Z.ai subscription',
    subscribeUrl: 'https://z.ai/subscribe',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    helpText: 'Create one at z.ai → Manage API keys',
    apiKeyPattern: '^[0-9a-f]{32}\\.[A-Za-z0-9]+$',
    featuredModelIds: ['glm-5.1', 'glm-5v-turbo'],
  },
  'kimi-plan': {
    id: 'kimi-plan',
    provider: 'moonshotai',
    displayName: 'Kimi',
    tagline: 'Kimi K2-series via Moonshot platform',
    subscribeUrl: 'https://platform.moonshot.ai/pricing',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    helpText: 'Create one at platform.moonshot.ai → Console → API keys',
    apiKeyPattern: '^sk-[A-Za-z0-9]{48}$',
    featuredModelIds: ['kimi-k2.6', 'kimi-k2.5'],
  },
  'qwen-plan': {
    id: 'qwen-plan',
    provider: 'alibaba',
    displayName: 'Qwen Coding Plan',
    tagline: 'Qwen3-Coder via Alibaba DashScope',
    subscribeUrl: 'https://www.alibabacloud.com/product/modelstudio',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    helpText: 'Create one at dashscope.console.aliyun.com → API-KEY',
    apiKeyPattern: '^sk-[a-f0-9]{32}$',
    featuredModelIds: ['qwen3-coder-30b-a3b-instruct', 'qwen3-32b'],
  },
  'minimax-plan': {
    id: 'minimax-plan',
    provider: 'minimax',
    displayName: 'MiniMax',
    tagline: 'MiniMax M-series via platform.minimax.io',
    subscribeUrl: 'https://platform.minimax.io/subscribe/token-plan',
    apiKeyUrl:
      'https://platform.minimax.io/user-center/basic-information/interface-key',
    helpText: 'Create one at platform.minimax.io → User Center → Interface key',
    featuredModelIds: ['minimax-m2.7'],
  },
};

export function isCodingPlanId(value: string): value is CodingPlanId {
  return Object.hasOwn(CODING_PLANS, value);
}
