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
  /** Opts this plan into a user-editable endpoint field in generic plan UI. */
  configurableEndpoint?: {
    label: string;
    placeholder?: string;
    helpText: string;
  };
  /** Provider-native model ID to use for validation. */
  validationModelId?: string;
  /** Additional endpoint note rendered in plan UI. */
  endpointHelpText?: string;
  /** Optional disclaimer rendered below the help text (e.g. unofficial status). */
  disclaimer?: string;
  /** Models to expose only when the plan's model-discovery route fails. */
  fallbackModelIds?: string[];
  /** Featured provider-native model IDs for card copy. */
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
    tagline: 'Qwen and partner coding models via Coding Plan',
    subscribeUrl:
      'https://www.alibabacloud.com/help/en/model-studio/coding-plan',
    apiKeyUrl: 'https://modelstudio.console.alibabacloud.com/',
    helpText:
      'Copy the subscription key from Model Studio → Coding Plan. Plan keys commonly start with sk-sp-.',
    apiKeyPattern: '^sk-(?:sp-)?[A-Za-z0-9_-]+$',
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
    validationBaseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
    validationModelId: 'qwen3.7-plus',
    endpointHelpText:
      'Routed through the international Coding Plan endpoint at coding-intl.dashscope.aliyuncs.com/v1.',
    disclaimer:
      'This subscription is limited to interactive coding-agent use and is not a general-purpose or batch API.',
    fallbackModelIds: [
      'qwen3.7-plus',
      'kimi-k2.5',
      'glm-5',
      'MiniMax-M2.5',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'qwen3-max-2026-01-23',
      'qwen3-coder-next',
      'qwen3-coder-plus',
      'glm-4.7',
    ],
    featuredModelIds: ['qwen3.7-plus', 'qwen3-coder-next'],
  },
  'qwen-token-plan': {
    id: 'qwen-token-plan',
    provider: 'alibaba',
    displayName: 'Qwen Token Plan',
    tagline: 'Qwen and partner models via Token Plan subscription',
    subscribeUrl:
      'https://www.alibabacloud.com/help/en/model-studio/token-plan',
    apiKeyUrl: 'https://modelstudio.console.alibabacloud.com/',
    helpText:
      'Copy the subscription key from Model Studio → Token Plan. Plan keys commonly start with sk-sp-.',
    apiKeyPattern: '^sk-(?:sp-)?[A-Za-z0-9_-]+$',
    baseUrl:
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    validationBaseUrl:
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    validationModelId: 'qwen3.7-plus',
    configurableEndpoint: {
      label: 'Token Plan endpoint',
      placeholder:
        'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      helpText:
        'Use the OpenAI-compatible endpoint shown in your Model Studio dashboard. The default is the Singapore endpoint.',
    },
    endpointHelpText:
      'Defaults to the Singapore Token Plan endpoint. Replace it with the endpoint from your Model Studio dashboard when it differs.',
    disclaimer:
      'This subscription is intended for interactive coding-agent traffic; image models use separate APIs and are not exposed here.',
    fallbackModelIds: [
      'qwen3.8-max-preview',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-flash',
      'glm-5.2',
      'deepseek-v4-pro',
    ],
    featuredModelIds: ['qwen3.8-max-preview', 'qwen3.7-plus'],
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

export type CodingPlanEndpointValidationResult =
  | { success: true; baseUrl: string }
  | { success: false; error: string };

/** Validate and normalize a hosted coding-plan endpoint before it is persisted. */
export function validateCodingPlanBaseUrl(
  value: string,
): CodingPlanEndpointValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { success: false, error: 'Enter an API endpoint.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { success: false, error: 'Enter a valid absolute URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { success: false, error: 'The API endpoint must use HTTPS.' };
  }
  if (parsed.username || parsed.password) {
    return {
      success: false,
      error: 'The API endpoint must not contain credentials.',
    };
  }
  if (parsed.search || parsed.hash) {
    return {
      success: false,
      error: 'The API endpoint must not contain a query string or fragment.',
    };
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return {
    success: true,
    baseUrl: `${parsed.origin}${pathname === '/' ? '' : pathname}`,
  };
}

function normalizeResolvedBaseUrl(
  value: string | undefined,
): string | undefined {
  if (!value?.trim()) return undefined;
  const result = validateCodingPlanBaseUrl(value);
  if (!result.success) throw new Error(result.error);
  return result.baseUrl;
}

/** Resolve the endpoint used for model discovery and runtime requests. */
export function resolveCodingPlanBaseUrl(
  plan: CodingPlan,
  instanceBaseUrl?: string,
): string | undefined {
  return (
    normalizeResolvedBaseUrl(instanceBaseUrl) ??
    normalizeResolvedBaseUrl(plan.baseUrl)
  );
}

/** Resolve validation, preferring the same explicit instance endpoint. */
export function resolveCodingPlanValidationBaseUrl(
  plan: CodingPlan,
  instanceBaseUrl?: string,
): string | undefined {
  return (
    normalizeResolvedBaseUrl(instanceBaseUrl) ??
    normalizeResolvedBaseUrl(plan.validationBaseUrl ?? plan.baseUrl)
  );
}

const codingPlanIdSet = new Set<string>(codingPlanIds);

export function isCodingPlanId(value: string): value is CodingPlanId {
  return codingPlanIdSet.has(value);
}
