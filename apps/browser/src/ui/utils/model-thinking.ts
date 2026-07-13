import type { availableModels } from '@shared/available-models';
import {
  getDefaultThinkingSelection,
  getEffectiveThinkingSelection,
  getNextThinkingSelection,
  getSupportedThinkingOptions,
  isExplicitThinkingOverride,
  type ThinkingOption,
} from '@shared/model-thinking-capabilities';
import type {
  ApiSpec,
  ModelThinkingOverride,
  ProviderEndpointMode,
} from '@shared/karton-contracts/ui/shared-types';

export type BuiltInModelForThinking = (typeof availableModels)[number];

export type ThinkingPanelModel = {
  modelId: string;
  modelDisplayName: string;
  providerOptions: unknown;
  officialProvider?: import('@shared/karton-contracts/ui/shared-types').ModelProvider;
  thinkingEnabled?: boolean;
};

export type ModelThinkingDisplayState = {
  enabled: boolean;
  provider: ThinkingOption['provider'];
  value: string;
  label: string;
  isOverride: boolean;
};

export type ModelThinkingDefaultOptions = {
  providerMode?: ProviderEndpointMode;
  customEndpointApiSpec?: ApiSpec;
};

export function getModelThinkingDisplayState(
  model: ThinkingPanelModel,
  override?: ModelThinkingOverride,
  options?: ModelThinkingDefaultOptions,
): ModelThinkingDisplayState | null {
  const selection = getEffectiveThinkingSelection(model, override, {
    modelProvider: model.officialProvider,
    ...options,
  });
  if (!selection) return null;

  return {
    enabled: selection.enabled,
    provider: selection.provider,
    value: selection.value,
    label: selection.enabled ? selection.label : 'Off',
    isOverride: isExplicitThinkingOverride(override),
  };
}

export function getDefaultThinkingOption(
  model: ThinkingPanelModel,
  options?: ModelThinkingDefaultOptions,
): ThinkingOption {
  return getDefaultThinkingSelection(model, {
    modelProvider: model.officialProvider,
    ...options,
  });
}

export function getModelThinkingOptions(
  model: ThinkingPanelModel,
  options?: ModelThinkingDefaultOptions,
): ThinkingOption[] {
  return getSupportedThinkingOptions(model, {
    modelProvider: model.officialProvider,
    ...options,
  });
}

export function getEnabledModelThinkingOption(
  model: ThinkingPanelModel,
  currentValue: string | undefined,
  options?: ModelThinkingDefaultOptions,
): ThinkingOption | undefined {
  const thinkingOptions = getModelThinkingOptions(model, options);
  const currentOption = thinkingOptions.find(
    (option) => option.value === currentValue,
  );
  if (currentOption?.enabled) return currentOption;

  const defaultOption = getDefaultThinkingOption(model, options);
  if (defaultOption.enabled) return defaultOption;

  return thinkingOptions.find((option) => option.enabled);
}

export function getNextModelThinkingOption(
  model: ThinkingPanelModel,
  currentValue: string,
  options?: ModelThinkingDefaultOptions,
): ThinkingOption {
  const current =
    getModelThinkingOptions(model, options).find(
      (option) => option.value === currentValue,
    ) ?? getDefaultThinkingOption(model, options);

  return getNextThinkingSelection(model, current, {
    modelProvider: model.officialProvider,
    ...options,
  });
}
