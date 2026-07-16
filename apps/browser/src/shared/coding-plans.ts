import { codingPlanIds, type CodingPlanId } from './coding-plan-ids';
import type { ModelProvider } from './karton-contracts/ui/shared-types';

export type { CodingPlanId } from './coding-plan-ids';

/**
 * Tier-A "bring your own subscription" coding plans.
 *
 * Each plan maps to a built-in provider. Plans may also define dedicated
 * runtime/validation endpoints when their subscription tokens do not work
 * against the provider's normal official API endpoint.
 *
 * Connecting a plan validates the user-supplied API key, encrypts+stores it in
 * providerConfigs[provider].encryptedApiKey, sets mode to 'official', and
 * records providerConfigs[provider].connectedCodingPlanId for routing.
 */
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
  /** Dedicated runtime base URL for subscription-plan tokens. */
  baseUrl?: string;
  /** Dedicated validation base URL. Defaults to `baseUrl` when omitted. */
  validationBaseUrl?: string;
  /** Provider-native model ID to use for validation. */
  validationModelId?: string;
  /** Additional endpoint note rendered in plan UI. */
  endpointHelpText?: string;
  /** Optional disclaimer rendered below the help text (e.g. unofficial status). */
  disclaimer?: string;
  /** Featured model IDs (must exist in availableModels) — for card copy. */
  featuredModelIds: string[];
};

export const CODING_PLANS: Record<CodingPlanId, CodingPlan> = {
  'glm-coding-plan': {
    id: 'glm-coding-plan',
    provider: 'z-ai',
    displayName: 'GLM Coding Plan',
    tagline: 'GLM-5.2, 5.1, 5V-Turbo via Z.ai subscription',
    subscribeUrl: 'https://z.ai/subscribe',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    helpText: 'Get your key at z.ai → Manage API keys',
    apiKeyPattern: '^[0-9a-f]{32}\\.[A-Za-z0-9]+$',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    validationBaseUrl: 'https://api.z.ai/api/coding/paas/v4',
    validationModelId: 'glm-5.2',
    endpointHelpText: 'Routed through api.z.ai/api/coding/paas/v4.',
    disclaimer:
      'stagewise is not yet an officially supported tool for the GLM Coding Plan. We are working with Z.ai on a partnership.',
    featuredModelIds: ['glm-5.2', 'glm-5.1', 'glm-5v-turbo'],
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
    featuredModelIds: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5'],
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
    displayName: 'MiniMax Token Plan',
    tagline: 'MiniMax M-series via Token Plan subscription',
    subscribeUrl: 'https://platform.minimax.io/subscribe/token-plan',
    apiKeyUrl:
      'https://platform.minimax.io/user-center/basic-information/interface-key',
    helpText:
      'Token Plan keys start with sk-cp-. Subscribe at platform.minimax.io → Token Plan.',
    apiKeyPattern: '^sk-cp-',
    endpointHelpText:
      'Token Plan keys are validated against the /v1/token_plan/remains endpoint.',
    featuredModelIds: ['minimax-m3', 'minimax-m2.7'],
  },
  'mimo-plan': {
    id: 'mimo-plan',
    provider: 'xiaomi-mimo',
    displayName: 'Xiaomi MiMo',
    tagline: 'MiMo V2.5-series via platform.xiaomimimo.com',
    subscribeUrl: 'https://platform.xiaomimimo.com/#/token-plan',
    apiKeyUrl: 'https://platform.xiaomimimo.com/#/console/plan-manage',
    helpText: 'Get your tp- key at platform.xiaomimimo.com → Subscription',
    apiKeyPattern: '^tp-[A-Za-z0-9]+$',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    validationBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    validationModelId: 'mimo-v2.5',
    endpointHelpText:
      'MiMo Token Plan keys (tp-xxxxx) are routed through https://token-plan-cn.xiaomimimo.com/v1. Singapore and Europe clusters are also available (token-plan-sgp / token-plan-ams).',
    featuredModelIds: ['mimo-v2.5-pro', 'mimo-v2.5'],
  },
};

const codingPlanIdSet = new Set<string>(codingPlanIds);

export function isCodingPlanId(value: string): value is CodingPlanId {
  return codingPlanIdSet.has(value);
}
