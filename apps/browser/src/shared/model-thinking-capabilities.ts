import type {
  ApiSpec,
  ModelProvider,
  ModelThinkingOverride,
  ProviderEndpointMode,
} from './karton-contracts/ui/shared-types';

export type ThinkingProvider =
  | 'stagewise'
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'openai-compatible';

export type ThinkingOption = {
  provider: ThinkingProvider;
  value: string;
  label: string;
  enabled: boolean;
};

export type ThinkingSelection = {
  provider: ThinkingProvider;
  value: string;
  label: string;
  enabled: boolean;
};

export type ThinkingRoute = {
  providerMode?: ProviderEndpointMode;
  modelProvider?: ModelProvider;
  /**
   * Protocol-level thinking behavior when it differs from the semantic vendor.
   * OpenRouter, for example, is an official provider but exposes OpenAI Chat
   * Completions-compatible reasoning options rather than OpenAI's native API.
   */
  thinkingProvider?: ThinkingProvider;
  customEndpointApiSpec?: ApiSpec;
};

export type ThinkingCapableModel = {
  modelId: string;
  providerOptions: unknown;
  officialProvider?: ModelProvider;
  thinkingEnabled?: boolean;
};

const STAGEWISE_OPTIONS = createOptions('stagewise', [
  ['minimal', 'Minimal', true],
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
  ['xhigh', 'Extra high', true],
]);

const OPENAI_GPT_5_OPTIONS = createOptions('openai', [
  ['none', 'Off', false],
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
  ['xhigh', 'Extra high', true],
]);

const OPENAI_CONSERVATIVE_OPTIONS = createOptions('openai', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
]);

const OPENAI_COMPATIBLE_OPTIONS = createOptions('openai-compatible', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
]);

const OPENAI_COMPATIBLE_MAX_OPTIONS = createOptions('openai-compatible', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
  // Z.ai maps OpenAI-compatible `xhigh` to GLM 5.2's native `max`.
  // The AI SDK Chat Completions validator rejects literal `max`.
  ['xhigh', 'Max', true],
]);

const GOOGLE_FULL_OPTIONS = createOptions('google', [
  ['minimal', 'Minimal', true],
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
]);

const GOOGLE_PRO_OPTIONS = createOptions('google', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
]);

const GOOGLE_PRO_STRICT_OPTIONS = createOptions('google', [
  ['low', 'Low', true],
  ['high', 'High', true],
]);

const ANTHROPIC_CONSERVATIVE_OPTIONS = createOptions('anthropic', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
]);

const ANTHROPIC_ADAPTIVE_MAX_OPTIONS = createOptions('anthropic', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
  ['max', 'Max', true],
]);

const ANTHROPIC_OPUS_47_OPTIONS = createOptions('anthropic', [
  ['low', 'Low', true],
  ['medium', 'Medium', true],
  ['high', 'High', true],
  ['xhigh', 'Extra high', true],
  ['max', 'Max', true],
]);

const ANTHROPIC_BUDGET_TOKENS: Record<string, number> = {
  low: 6_000,
  medium: 10_000,
  high: 16_000,
  xhigh: 24_000,
  max: 32_000,
};

function createOptions(
  provider: ThinkingProvider,
  entries: Array<[value: string, label: string, enabled: boolean]>,
): ThinkingOption[] {
  return entries.map(([value, label, enabled]) => ({
    provider,
    value,
    label,
    enabled,
  }));
}

export function getThinkingProviderForRoute({
  providerMode = 'stagewise',
  modelProvider,
  thinkingProvider,
  customEndpointApiSpec,
}: ThinkingRoute): ThinkingProvider {
  if (thinkingProvider) return thinkingProvider;

  if (providerMode === 'custom' && customEndpointApiSpec) {
    switch (customEndpointApiSpec) {
      case 'anthropic':
      case 'amazon-bedrock':
        return 'anthropic';
      case 'google':
      case 'google-vertex':
        return 'google';
      case 'openai-responses':
      case 'azure':
        return 'openai';
      case 'openai-chat-completions':
        return 'openai-compatible';
    }
  }

  switch (modelProvider) {
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    case 'openai':
      return 'openai';
    case 'moonshotai':
    case 'alibaba':
    case 'deepseek':
    case 'z-ai':
    case 'minimax':
    case 'xiaomi-mimo':
    case 'mistral':
      return 'openai-compatible';
    default:
      // Unknown routes have no proven provider-native reasoning contract.
      // Never emit Stagewise-only fields to an external endpoint.
      return providerMode === 'stagewise' ? 'stagewise' : 'openai-compatible';
  }
}

export function getSupportedThinkingOptions(
  modelOrId: ThinkingCapableModel | string,
  route?: ThinkingRoute,
): ThinkingOption[] {
  const modelId = typeof modelOrId === 'string' ? modelOrId : modelOrId.modelId;
  const provider = getThinkingProviderForRoute({
    modelProvider:
      typeof modelOrId === 'string'
        ? route?.modelProvider
        : modelOrId.officialProvider,
    ...route,
  });

  switch (provider) {
    case 'stagewise':
      return STAGEWISE_OPTIONS;
    case 'openai':
      return isKnownOpenAiGpt5Model(modelId)
        ? OPENAI_GPT_5_OPTIONS
        : OPENAI_CONSERVATIVE_OPTIONS;
    case 'openai-compatible':
      return getOpenAiCompatibleOptions(modelId);
    case 'google':
      return getGoogleOptions(modelId);
    case 'anthropic':
      return getAnthropicOptions(modelId);
  }
}

export function getDefaultThinkingSelection(
  model: ThinkingCapableModel,
  route?: ThinkingRoute,
): ThinkingSelection {
  const options = getSupportedThinkingOptions(model, route);
  const provider = options[0]?.provider ?? 'stagewise';
  const providerDefault = getProviderDefaultValue(
    model.providerOptions,
    provider,
  );
  const stagewiseDefault = getProviderDefaultValue(
    model.providerOptions,
    'stagewise',
  );
  const preferredValue =
    provider === 'stagewise'
      ? (stagewiseDefault ?? providerDefault)
      : (providerDefault ?? stagewiseDefault);

  const option =
    findSupportedOption(options, preferredValue) ??
    findSupportedOption(options, 'medium') ??
    firstEnabledOption(options) ??
    options[0];

  return toSelection(
    option ?? {
      provider,
      value: 'medium',
      label: 'Medium',
      enabled: true,
    },
  );
}

export function getEffectiveThinkingSelection(
  model: ThinkingCapableModel,
  override?: ModelThinkingOverride,
  route?: ThinkingRoute,
): ThinkingSelection | null {
  if (!isThinkingCapableModel(model)) return null;

  const options = getSupportedThinkingOptions(model, route);
  const provider =
    options[0]?.provider ?? getThinkingProviderForRoute(route ?? {});
  const defaultSelection = getDefaultThinkingSelection(model, route);
  const hasOverride = hasExplicitThinkingOverride(override);

  if (!hasOverride) return defaultSelection;

  if (override?.enabled === false) {
    return toDisabledSelection(
      options,
      provider,
      findSupportedOption(options, override.value)?.value ??
        defaultSelection.value,
    );
  }

  const matchingOverride = isMatchingOverrideProvider(
    override?.provider,
    provider,
    route,
  );
  const option = matchingOverride
    ? findSupportedOption(options, override?.value)
    : undefined;

  return toSelection(option ?? defaultSelection);
}

export function isExplicitThinkingOverride(
  override: ModelThinkingOverride | undefined,
): boolean {
  return hasExplicitThinkingOverride(override);
}

export function getNextThinkingSelection(
  model: ThinkingCapableModel,
  current: ThinkingSelection,
  route?: ThinkingRoute,
): ThinkingSelection {
  const options = getSupportedThinkingOptions(model, route);
  const currentIndex = options.findIndex(
    (option) => option.value === current.value,
  );
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + 1) % options.length;

  return toSelection(options[nextIndex] ?? current);
}

export function createThinkingProviderOptionsPatch({
  model,
  route,
  override,
}: {
  model: ThinkingCapableModel;
  route?: ThinkingRoute;
  override?: ModelThinkingOverride;
}): Record<string, unknown> | undefined {
  if (
    !isThinkingCapableModel(model) ||
    !hasExplicitThinkingOverride(override)
  ) {
    return undefined;
  }

  const selection = getEffectiveThinkingSelection(model, override, route);
  if (!selection) return undefined;

  switch (selection.provider) {
    case 'stagewise':
      return {
        stagewise: {
          reasoning: {
            enabled: selection.enabled,
            effort: selection.enabled ? selection.value : undefined,
          },
        },
      };
    case 'openai':
      return {
        openai: selection.enabled
          ? { reasoningEffort: selection.value, reasoningSummary: 'auto' }
          : { reasoningEffort: 'none', reasoningSummary: undefined },
      };
    case 'openai-compatible':
      return {
        openai: selection.enabled
          ? { reasoningEffort: selection.value }
          : { reasoningEffort: undefined, reasoningSummary: undefined },
      };
    case 'google':
      return {
        google: {
          thinkingConfig: {
            includeThoughts: selection.enabled,
            thinkingLevel: selection.enabled ? selection.value : undefined,
          },
        },
      };
    case 'anthropic':
      return {
        anthropic: createAnthropicThinkingPatch(
          model.providerOptions,
          selection.enabled,
          selection.value,
        ),
      };
  }
}

export function toModelThinkingOverride(
  selection: Pick<ThinkingSelection, 'provider' | 'value' | 'enabled'>,
): ModelThinkingOverride {
  return {
    enabled: selection.enabled,
    provider: selection.provider,
    value: selection.value,
  };
}

function isMatchingOverrideProvider(
  overrideProvider: ModelThinkingOverride['provider'] | undefined,
  provider: ThinkingProvider,
  route: ThinkingRoute | undefined,
): boolean {
  return (
    overrideProvider === provider ||
    overrideProvider === undefined ||
    (route?.providerMode === 'stagewise' && overrideProvider === 'stagewise')
  );
}

function getOpenAiCompatibleOptions(modelId: string): ThinkingOption[] {
  if (modelId === 'glm-5.2') return OPENAI_COMPATIBLE_MAX_OPTIONS;
  return OPENAI_COMPATIBLE_OPTIONS;
}

function getGoogleOptions(modelId: string): ThinkingOption[] {
  if (modelId.startsWith('gemini-3.1-pro')) return GOOGLE_PRO_OPTIONS;
  if (modelId.startsWith('gemini-3-pro')) return GOOGLE_PRO_STRICT_OPTIONS;
  if (modelId.startsWith('gemini-3') && modelId.includes('flash')) {
    return GOOGLE_FULL_OPTIONS;
  }
  return GOOGLE_PRO_OPTIONS;
}

function getAnthropicOptions(modelId: string): ThinkingOption[] {
  if (
    modelId.startsWith('claude-fable-5') ||
    modelId.startsWith('claude-mythos-5') ||
    modelId.startsWith('claude-mythos-preview') ||
    modelId.startsWith('claude-opus-4.7') ||
    modelId.startsWith('claude-opus-4.8')
  ) {
    return ANTHROPIC_OPUS_47_OPTIONS;
  }

  if (
    modelId.startsWith('claude-opus-4.6') ||
    modelId.startsWith('claude-sonnet-4.6') ||
    modelId.startsWith('claude-sonnet-5')
  ) {
    return ANTHROPIC_ADAPTIVE_MAX_OPTIONS;
  }

  return ANTHROPIC_CONSERVATIVE_OPTIONS;
}

function isKnownOpenAiGpt5Model(modelId: string): boolean {
  return /^gpt-5\.\d+(?:$|-)/.test(modelId) || modelId === 'gpt-5';
}

function findSupportedOption(
  options: ThinkingOption[],
  value: unknown,
): ThinkingOption | undefined {
  if (typeof value !== 'string') return undefined;
  return options.find((option) => option.value === value);
}

function firstEnabledOption(
  options: ThinkingOption[],
): ThinkingOption | undefined {
  return options.find((option) => option.enabled);
}

function toSelection(
  option: ThinkingOption | ThinkingSelection,
): ThinkingSelection {
  return {
    provider: option.provider,
    value: option.value,
    label: option.label,
    enabled: option.enabled,
  };
}

function toDisabledSelection(
  options: ThinkingOption[],
  provider: ThinkingProvider,
  fallbackValue: string,
): ThinkingSelection {
  const offOption = options.find((option) => !option.enabled);
  if (offOption) return toSelection(offOption);

  return {
    provider,
    value: fallbackValue,
    label: 'Off',
    enabled: false,
  };
}

function getProviderDefaultValue(
  providerOptions: unknown,
  provider: ThinkingProvider,
): string | undefined {
  if (!isPlainObject(providerOptions)) return undefined;

  switch (provider) {
    case 'stagewise': {
      const stagewise = providerOptions.stagewise;
      if (!isPlainObject(stagewise)) return undefined;
      const reasoning = stagewise.reasoning;
      if (!isPlainObject(reasoning)) return undefined;
      return typeof reasoning.effort === 'string'
        ? reasoning.effort
        : undefined;
    }
    case 'openai':
    case 'openai-compatible': {
      const openai = providerOptions.openai;
      if (!isPlainObject(openai)) return undefined;
      return typeof openai.reasoningEffort === 'string'
        ? openai.reasoningEffort
        : undefined;
    }
    case 'google': {
      const google = providerOptions.google;
      if (!isPlainObject(google)) return undefined;
      const thinkingConfig = google.thinkingConfig;
      if (!isPlainObject(thinkingConfig)) return undefined;
      return typeof thinkingConfig.thinkingLevel === 'string'
        ? thinkingConfig.thinkingLevel
        : undefined;
    }
    case 'anthropic': {
      const anthropic = providerOptions.anthropic;
      if (!isPlainObject(anthropic)) return undefined;
      if (typeof anthropic.effort === 'string') return anthropic.effort;
      const thinking = anthropic.thinking;
      if (!isPlainObject(thinking)) return undefined;
      return getThinkingValueFromAnthropicBudget(thinking.budgetTokens);
    }
  }
}

function createAnthropicThinkingPatch(
  modelProviderOptions: unknown,
  enabled: boolean,
  value: string,
): Record<string, unknown> {
  if (!enabled) {
    return { thinking: { type: 'disabled' }, effort: undefined };
  }

  const baseAnthropicOptions = isPlainObject(modelProviderOptions)
    ? modelProviderOptions.anthropic
    : undefined;
  const thinking = isPlainObject(baseAnthropicOptions)
    ? baseAnthropicOptions.thinking
    : undefined;

  if (
    isPlainObject(thinking) &&
    typeof thinking.type === 'string' &&
    thinking.type !== 'adaptive'
  ) {
    return {
      thinking: {
        ...thinking,
        type: 'enabled',
        budgetTokens:
          ANTHROPIC_BUDGET_TOKENS[value] ?? ANTHROPIC_BUDGET_TOKENS.medium,
      },
    };
  }

  return {
    thinking: { type: 'adaptive' },
    effort: value,
  };
}

function getThinkingValueFromAnthropicBudget(
  budgetTokens: unknown,
): string | undefined {
  if (typeof budgetTokens !== 'number') return undefined;

  let closestValue = 'medium';
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [value, budget] of Object.entries(ANTHROPIC_BUDGET_TOKENS)) {
    const distance = Math.abs(budgetTokens - budget);
    if (distance < closestDistance) {
      closestValue = value;
      closestDistance = distance;
    }
  }

  return closestValue;
}

function isThinkingCapableModel(model: ThinkingCapableModel): boolean {
  return model.thinkingEnabled === true;
}

function hasExplicitThinkingOverride(
  override: ModelThinkingOverride | undefined,
): boolean {
  return (
    override?.enabled !== undefined ||
    override?.provider !== undefined ||
    override?.value !== undefined
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
