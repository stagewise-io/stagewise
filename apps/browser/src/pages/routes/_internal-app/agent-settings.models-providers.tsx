import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import type {
  CustomEndpoint,
  CustomModel,
  ModelCapabilities,
  ModelProvider,
  ProviderEndpointMode,
} from '@shared/karton-contracts/ui/shared-types';
import {
  PROVIDER_DISPLAY_INFO,
  PROVIDER_OFFICIAL_URLS,
} from '@shared/karton-contracts/ui/shared-types';
import { availableModels } from '@shared/available-models';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { cn } from '@pages/utils';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { Input } from '@stagewise/stage-ui/components/input';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select } from '@stagewise/stage-ui/components/select';
import { Switch } from '@stagewise/stage-ui/components/switch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogHeader,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { produceWithPatches, enablePatches } from 'immer';
import {
  IconChevronRightOutline18,
  IconChevronDownOutline18,
  IconPlusOutline18,
  IconPenOutline18,
  IconTrashOutline18,
  IconArrowUpOutline18,
  IconArrowDownOutline18,
} from 'nucleo-ui-outline-18';

enablePatches();

export const Route = createFileRoute(
  '/_internal-app/agent-settings/models-providers',
)({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Models & Providers',
      },
    ],
  }),
});

// =============================================================================
// Model Provider Configuration
// =============================================================================

const PROVIDERS: ModelProvider[] = [
  'anthropic',
  'openai',
  'google',
  'moonshotai',
  'alibaba',
  'deepseek',
  'z-ai',
];

function ProviderConfigCard({ provider }: { provider: ModelProvider }) {
  const navigate = useNavigate();
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const setProviderApiKey = useKartonProcedure((s) => s.setProviderApiKey);
  const clearProviderApiKey = useKartonProcedure((s) => s.clearProviderApiKey);
  const validateProviderApiKey = useKartonProcedure(
    (s) => s.validateProviderApiKey,
  );

  const config = preferences.providerConfigs?.[provider] ?? {
    mode: 'stagewise' as const,
  };
  const displayInfo = PROVIDER_DISPLAY_INFO[provider];
  const officialUrl = PROVIDER_OFFICIAL_URLS[provider];
  const customEndpoints = preferences?.customEndpoints ?? [];

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validated, setValidated] = useState<
    null | { success: true } | { success: false; error: string }
  >(null);
  const hasKey = !!config.encryptedApiKey;

  useEffect(() => {
    if (validated?.success) {
      const timer = setTimeout(() => setValidated(null), 2_000);
      return () => clearTimeout(timer);
    }
  }, [validated]);

  const handleModeChange = useCallback(
    async (newMode: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.providerConfigs[provider].mode = newMode as ProviderEndpointMode;
      });
      await updatePreferences(patches);
    },
    [preferences, provider, updatePreferences],
  );

  const handleCustomProviderChange = useCallback(
    async (endpointId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.providerConfigs[provider].customProviderId = endpointId;
      });
      await updatePreferences(patches);
    },
    [preferences, provider, updatePreferences],
  );

  const handleSaveAndValidate = useCallback(
    async (key: string) => {
      if (!key.trim()) return;
      const trimmedKey = key.trim();

      if (config.mode === 'official') {
        setIsValidating(true);
        setValidated(null);
        try {
          const result = await validateProviderApiKey(provider, trimmedKey);
          if (result && !result.success) {
            setValidated({ success: false, error: result.error });
            return;
          }
        } catch {
          setValidated({
            success: false,
            error: 'Validation request failed. Please try again.',
          });
          return;
        } finally {
          setIsValidating(false);
        }
      }

      setIsSavingKey(true);
      try {
        await setProviderApiKey(provider, trimmedKey);
        setApiKeyInput('');
        setValidated({ success: true });
      } finally {
        setIsSavingKey(false);
      }
    },
    [provider, config, setProviderApiKey, validateProviderApiKey],
  );

  const handleClearApiKey = useCallback(async () => {
    await clearProviderApiKey(provider);
    setValidated(null);
  }, [provider, clearProviderApiKey]);

  const customProviderItems = customEndpoints.map((ep) => ({
    value: ep.id,
    label: ep.name,
  }));

  return (
    <div className="space-y-3 rounded-lg border border-derived p-3">
      <div className="-mt-1">
        <h3 className="font-medium text-foreground text-sm">
          {displayInfo.name}
        </h3>
        <p className="text-muted-foreground text-xs">
          {displayInfo.description}
        </p>
      </div>

      <RadioGroup value={config.mode} onValueChange={handleModeChange}>
        <RadioLabel>
          <Radio value="stagewise" />
          <span>Use my stagewise account</span>
        </RadioLabel>

        <RadioLabel>
          <Radio value="official" />
          <span>Use own API key with {displayInfo.name} API</span>
        </RadioLabel>

        <RadioLabel>
          <Radio value="custom" />
          <span>Use custom provider</span>
        </RadioLabel>
      </RadioGroup>

      {/* Official mode: API key fields */}
      {config.mode === 'official' && (
        <div className="grid grid-cols-1 gap-3 border-derived border-t pt-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">
              Endpoint URL
            </p>
            <Input
              value={officialUrl}
              disabled
              size="sm"
              style={{ maxWidth: 'none' }}
            />
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">
              API Key
              {isValidating && (
                <span className="ml-1.5 font-normal text-subtle-foreground">
                  validating...
                </span>
              )}
              {!isValidating && validated?.success && (
                <span className="ml-1.5 font-normal text-success-foreground">
                  Updated
                </span>
              )}
            </p>
            <div className="flex gap-1.5">
              <Input
                type="password"
                value={apiKeyInput}
                placeholder={
                  hasKey || validated
                    ? '••••••••••••••••••••••••••••••••'
                    : 'Enter API key...'
                }
                onValueChange={(v) => {
                  setApiKeyInput(v);
                  setValidated(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiKeyInput.trim()) {
                    void handleSaveAndValidate(apiKeyInput);
                  }
                }}
                onBlur={() => {
                  if (apiKeyInput.trim()) {
                    void handleSaveAndValidate(apiKeyInput);
                  }
                }}
                disabled={isValidating || isSavingKey}
                size="sm"
                style={{ maxWidth: 'none' }}
                className="min-w-0 flex-1"
              />
              {apiKeyInput ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSaveAndValidate(apiKeyInput)}
                  disabled={isValidating || isSavingKey}
                >
                  Save
                </Button>
              ) : hasKey ? (
                <Button variant="ghost" size="sm" onClick={handleClearApiKey}>
                  Clear
                </Button>
              ) : null}
            </div>
            {validated && !validated.success && (
              <TruncatedErrorText text={validated.error} />
            )}
          </div>
        </div>
      )}

      {/* Custom provider mode: select from configured providers */}
      {config.mode === 'custom' && (
        <div className="border-derived border-t pt-3">
          {customEndpoints.length === 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                No custom providers configured yet.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  navigate({ to: '/agent-settings/custom-providers' })
                }
              >
                Configure Providers
                <IconChevronRightOutline18 className="size-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground text-xs">
                Provider
              </p>
              <Select
                value={config.customProviderId ?? ''}
                onValueChange={handleCustomProviderChange}
                items={customProviderItems}
                placeholder="Select a provider..."
                size="sm"
                triggerClassName="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelProvidersSection() {
  const [showAll, setShowAll] = useState(false);
  const primary = PROVIDERS.slice(0, 3);
  const secondary = PROVIDERS.slice(3);
  return (
    <div className="space-y-3">
      {primary.map((provider) => (
        <ProviderConfigCard key={provider} provider={provider} />
      ))}
      {showAll &&
        secondary.map((provider) => (
          <ProviderConfigCard key={provider} provider={provider} />
        ))}
      {secondary.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show less' : `Show ${secondary.length} more providers`}
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Model Components
// =============================================================================

const BUILT_IN_MODEL_IDS = new Set(
  availableModels.map((m) => m.modelId),
) as Set<string>;

function CustomModelDialog({
  model,
  open,
  onOpenChange,
  onSave,
  existingModelIds,
  customEndpoints,
}: {
  model?: CustomModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    data: Omit<CustomModel, 'providerOptions' | 'headers'> & {
      providerOptions: Record<string, unknown>;
      headers: Record<string, string>;
    },
  ) => void;
  existingModelIds: Set<string>;
  customEndpoints: CustomEndpoint[];
}) {
  const [modelId, setModelId] = useState(model?.modelId ?? '');
  const [displayName, setDisplayName] = useState(model?.displayName ?? '');
  const [description, setDescription] = useState(model?.description ?? '');
  const [contextWindowSize, setContextWindowSize] = useState(
    model?.contextWindowSize ?? 128000,
  );
  const [endpointId, setEndpointId] = useState(model?.endpointId ?? 'openai');
  const [thinkingEnabled, setThinkingEnabled] = useState(
    model?.thinkingEnabled ?? false,
  );
  const defaultCaps: ModelCapabilities = {
    inputModalities: {
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    },
    outputModalities: {
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    },
    toolCalling: true,
  };
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(
    model?.capabilities ?? defaultCaps,
  );
  const [providerOptionsJson, setProviderOptionsJson] = useState(
    model?.providerOptions && Object.keys(model.providerOptions).length > 0
      ? JSON.stringify(model.providerOptions, null, 2)
      : '',
  );
  const [headersJson, setHeadersJson] = useState(
    model?.headers && Object.keys(model.headers).length > 0
      ? JSON.stringify(model.headers, null, 2)
      : '',
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  scrollViewportRef.current = scrollViewport;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  useEffect(() => {
    if (open) {
      setModelId(model?.modelId ?? '');
      setDisplayName(model?.displayName ?? '');
      setDescription(model?.description ?? '');
      setContextWindowSize(model?.contextWindowSize ?? 128000);
      setEndpointId(model?.endpointId ?? 'openai');
      setThinkingEnabled(model?.thinkingEnabled ?? false);
      setCapabilities(model?.capabilities ?? defaultCaps);
      setProviderOptionsJson(
        model?.providerOptions && Object.keys(model.providerOptions).length > 0
          ? JSON.stringify(model.providerOptions, null, 2)
          : '',
      );
      setHeadersJson(
        model?.headers && Object.keys(model.headers).length > 0
          ? JSON.stringify(model.headers, null, 2)
          : '',
      );
      setShowAdvanced(false);
      setJsonError(null);
    }
  }, [open, model]);

  const endpointOptions = useMemo(() => {
    const builtIn = [
      { value: 'anthropic', label: 'Anthropic', group: 'Built-in' },
      { value: 'openai', label: 'OpenAI', group: 'Built-in' },
      { value: 'google', label: 'Google', group: 'Built-in' },
      { value: 'moonshotai', label: 'Moonshot AI', group: 'Built-in' },
      { value: 'alibaba', label: 'Alibaba Cloud', group: 'Built-in' },
      { value: 'deepseek', label: 'DeepSeek', group: 'Built-in' },
      { value: 'z-ai', label: 'Z.ai', group: 'Built-in' },
    ];
    const custom = customEndpoints.map((ep) => ({
      value: ep.id,
      label: ep.name,
      group: 'Custom',
    }));
    return [...builtIn, ...custom];
  }, [customEndpoints]);

  const isDuplicate =
    modelId.trim().length > 0 &&
    (BUILT_IN_MODEL_IDS.has(modelId.trim()) ||
      (existingModelIds.has(modelId.trim()) &&
        modelId.trim() !== model?.modelId));

  const canSave =
    modelId.trim().length > 0 &&
    displayName.trim().length > 0 &&
    !isDuplicate &&
    !jsonError;

  const handleSave = () => {
    let providerOptions: Record<string, unknown> = {};
    let headers: Record<string, string> = {};

    if (providerOptionsJson.trim()) {
      try {
        providerOptions = JSON.parse(providerOptionsJson);
      } catch {
        setJsonError('Invalid JSON in Provider Options');
        return;
      }
    }
    if (headersJson.trim()) {
      try {
        headers = JSON.parse(headersJson);
      } catch {
        setJsonError('Invalid JSON in Headers');
        return;
      }
    }

    onSave({
      modelId: modelId.trim(),
      displayName: displayName.trim(),
      description: description.trim(),
      contextWindowSize,
      endpointId,
      thinkingEnabled,
      capabilities,
      providerOptions,
      headers,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-md">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>{model ? 'Edit Model' : 'Add Custom Model'}</DialogTitle>
          <DialogDescription>
            Define a model and assign it to a provider or custom endpoint.
          </DialogDescription>
        </DialogHeader>

        <OverlayScrollbar
          className="mask-alpha min-h-0 flex-1"
          style={maskStyle}
          onViewportRef={setScrollViewport}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs">Model ID</p>
              <Input
                placeholder="gpt-4o-mini"
                value={modelId}
                onValueChange={(val) => {
                  setModelId(val);
                  setJsonError(null);
                }}
                size="sm"
              />
              {isDuplicate && (
                <p className="text-error-foreground text-xs">
                  This model ID already exists.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs">
                Display Name
              </p>
              <Input
                placeholder="GPT-4o Mini"
                value={displayName}
                onValueChange={setDisplayName}
                size="sm"
              />
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs">
                Description{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </p>
              <Input
                placeholder="A fast, affordable model..."
                value={description}
                onValueChange={setDescription}
                size="sm"
              />
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs">
                Context Window
              </p>
              <Input
                type="number"
                value={String(contextWindowSize)}
                onValueChange={(val) =>
                  setContextWindowSize(Number.parseInt(val, 10) || 128000)
                }
                size="sm"
              />
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs">Endpoint</p>
              <Select
                value={endpointId}
                onValueChange={(val) => setEndpointId(val as string)}
                items={endpointOptions}
                size="sm"
                triggerClassName="w-full"
              />
            </div>

            {/* Capabilities */}
            <div className="space-y-3 border-derived border-t pt-3">
              <p className="font-medium text-foreground text-xs">
                Capabilities
              </p>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: base-ui Switch renders a button, label click delegates correctly */}
                <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs">
                  <Switch
                    checked={thinkingEnabled}
                    onCheckedChange={setThinkingEnabled}
                    size="xs"
                  />
                  Thinking
                </label>

                {/* biome-ignore lint/a11y/noLabelWithoutControl: base-ui Switch renders a button, label click delegates correctly */}
                <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs">
                  <Switch
                    checked={capabilities.toolCalling}
                    onCheckedChange={(v) =>
                      setCapabilities((c) => ({ ...c, toolCalling: v }))
                    }
                    size="xs"
                  />
                  Tool Calling
                </label>
              </div>

              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">
                  Input Modalities
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {(['text', 'image', 'audio', 'video', 'file'] as const).map(
                    (mod) => (
                      // biome-ignore lint/a11y/noLabelWithoutControl: base-ui Switch renders a button, label click delegates correctly
                      <label
                        key={mod}
                        className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs"
                      >
                        <Switch
                          checked={capabilities.inputModalities[mod]}
                          onCheckedChange={(v) =>
                            setCapabilities((c) => ({
                              ...c,
                              inputModalities: {
                                ...c.inputModalities,
                                [mod]: v,
                              },
                            }))
                          }
                          size="xs"
                        />
                        {mod}
                      </label>
                    ),
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">
                  Output Modalities
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {(['text', 'image', 'audio', 'video', 'file'] as const).map(
                    (mod) => (
                      // biome-ignore lint/a11y/noLabelWithoutControl: base-ui Switch renders a button, label click delegates correctly
                      <label
                        key={mod}
                        className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs"
                      >
                        <Switch
                          checked={capabilities.outputModalities[mod]}
                          onCheckedChange={(v) =>
                            setCapabilities((c) => ({
                              ...c,
                              outputModalities: {
                                ...c.outputModalities,
                                [mod]: v,
                              },
                            }))
                          }
                          size="xs"
                        />
                        {mod}
                      </label>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="border-derived border-t pt-3">
              <button
                type="button"
                className="flex w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <IconChevronDownOutline18
                  className={`size-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
                Advanced
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground text-xs">
                      Provider Options (JSON)
                    </p>
                    <textarea
                      className="w-full rounded-lg border border-derived p-2 font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
                      rows={3}
                      placeholder='{"reasoningEffort": "high"}'
                      value={providerOptionsJson}
                      onChange={(e) => {
                        setProviderOptionsJson(e.target.value);
                        setJsonError(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground text-xs">
                      Headers (JSON)
                    </p>
                    <textarea
                      className="w-full rounded-lg border border-derived p-2 font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
                      rows={3}
                      placeholder='{"x-custom-header": "value"}'
                      value={headersJson}
                      onChange={(e) => {
                        setHeadersJson(e.target.value);
                        setJsonError(null);
                      }}
                    />
                  </div>
                  {jsonError && (
                    <p className="text-error-foreground text-xs">{jsonError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </OverlayScrollbar>

        <DialogFooter>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={handleSave}
          >
            {model ? 'Save Changes' : 'Add Model'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuiltInModelCard({
  model,
  isEnabled,
  onToggle,
}: {
  model: (typeof availableModels)[number];
  isEnabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'cursor-pointer rounded-lg border border-derived bg-surface-1 p-3',
        !isEnabled && 'opacity-60',
      )}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="-mt-1 min-w-0 flex-1">
          <h3 className="font-medium text-foreground text-sm">
            {model.modelDisplayName}
          </h3>
          <p className="text-muted-foreground text-xs">
            {model.modelId} &middot;{' '}
            {model.officialProvider
              ? PROVIDER_DISPLAY_INFO[model.officialProvider].name
              : 'Unknown'}{' '}
            &middot; {model.modelContext}
            {model.pricing &&
              (model.pricing.relativeMultiplier < 0.5 ||
                model.pricing.relativeMultiplier > 2.0) && (
                <>
                  {' · '}
                  <span className="inline-flex items-center">
                    $
                    {model.pricing.relativeMultiplier < 0.5 ? (
                      <IconArrowDownOutline18 className="size-2.5" />
                    ) : (
                      <IconArrowUpOutline18 className="size-2.5" />
                    )}
                  </span>
                </>
              )}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={isEnabled}
            onCheckedChange={() => onToggle()}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}

function CustomModelCard({
  model,
  endpointName,
  isEnabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  model: CustomModel;
  endpointName: string;
  isEnabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'cursor-pointer rounded-lg border border-derived bg-surface-1 p-3',
        !isEnabled && 'opacity-60',
      )}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="-mt-1 min-w-0 flex-1">
          <h3 className="font-medium text-foreground text-sm">
            {model.displayName}
          </h3>
          <p className="truncate text-muted-foreground text-xs">
            {model.modelId} &middot; {endpointName} &middot;{' '}
            {Math.round(model.contextWindowSize / 1000)}k context
          </p>
          {model.description && (
            <p className="mt-0.5 truncate text-muted-foreground/70 text-xs">
              {model.description}
            </p>
          )}
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onEdit}
            className="size-4"
          >
            <IconPenOutline18 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            className="mr-0.5 size-4"
          >
            <IconTrashOutline18 className="size-3.5" />
          </Button>
          <Switch
            checked={isEnabled}
            onCheckedChange={() => onToggle()}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}

function CustomModelsSection() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const customModels = preferences?.customModels ?? [];
  const customEndpoints = preferences?.customEndpoints ?? [];
  const disabledModelIds = useMemo(
    () => new Set(preferences?.agent.disabledModelIds ?? []),
    [preferences?.agent.disabledModelIds],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<CustomModel | undefined>(
    undefined,
  );

  const existingModelIds = useMemo(
    () => new Set(customModels.map((m) => m.modelId)),
    [customModels],
  );

  const resolveEndpointName = useCallback(
    (endpointId: string) => {
      if (endpointId === 'anthropic') return 'Anthropic';
      if (endpointId === 'openai') return 'OpenAI';
      if (endpointId === 'google') return 'Google';
      if (endpointId === 'moonshotai') return 'Moonshot AI';
      if (endpointId === 'alibaba') return 'Alibaba Cloud';
      if (endpointId === 'deepseek') return 'DeepSeek';
      if (endpointId === 'z-ai') return 'Z.ai';
      return (
        customEndpoints.find((ep) => ep.id === endpointId)?.name ?? 'Unknown'
      );
    },
    [customEndpoints],
  );

  const [searchQuery, setSearchQuery] = useState('');

  const filteredBuiltIn = useMemo(() => {
    if (!searchQuery.trim()) return availableModels;
    const q = searchQuery.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.modelDisplayName.toLowerCase().includes(q) ||
        (m.officialProvider &&
          PROVIDER_DISPLAY_INFO[m.officialProvider].name
            .toLowerCase()
            .includes(q)),
    );
  }, [searchQuery]);

  const filteredCustom = useMemo(() => {
    if (!searchQuery.trim()) return customModels;
    const q = searchQuery.toLowerCase();
    return customModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q) ||
        resolveEndpointName(m.endpointId).toLowerCase().includes(q),
    );
  }, [searchQuery, customModels, resolveEndpointName]);

  const [listScrollViewport, setListScrollViewport] =
    useState<HTMLElement | null>(null);
  const listScrollRef = useRef<HTMLElement | null>(null);
  listScrollRef.current = listScrollViewport;
  const { maskStyle: listMaskStyle } = useScrollFadeMask(listScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const handleAdd = useCallback(() => {
    setEditingModel(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((m: CustomModel) => {
    setEditingModel(m);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (
      data: Omit<CustomModel, 'providerOptions' | 'headers'> & {
        providerOptions: Record<string, unknown>;
        headers: Record<string, string>;
      },
    ) => {
      if (editingModel) {
        const idx = customModels.findIndex(
          (m) => m.modelId === editingModel.modelId,
        );
        if (idx === -1) return;
        const [, patches] = produceWithPatches(preferences, (draft) => {
          draft.customModels[idx] = data;
        });
        await updatePreferences(patches);
      } else {
        const [, patches] = produceWithPatches(preferences, (draft) => {
          draft.customModels.push(data);
        });
        await updatePreferences(patches);
      }
    },
    [editingModel, customModels, preferences, updatePreferences],
  );

  const handleDelete = useCallback(
    async (modelId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.customModels.findIndex((m) => m.modelId === modelId);
        if (idx !== -1) {
          draft.customModels.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const handleToggleModel = useCallback(
    async (modelId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.agent.disabledModelIds.indexOf(modelId);
        if (idx === -1) {
          draft.agent.disabledModelIds.push(modelId);
        } else {
          draft.agent.disabledModelIds.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const noResults =
    searchQuery.trim().length > 0 &&
    filteredBuiltIn.length === 0 &&
    filteredCustom.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Filter models..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          size="sm"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          <IconPlusOutline18 className="size-3.5" />
          Add Model
        </Button>
      </div>

      <OverlayScrollbar
        className="mask-alpha h-96"
        style={listMaskStyle}
        onViewportRef={setListScrollViewport}
        contentClassName="space-y-3"
      >
        {filteredBuiltIn.map((model) => (
          <BuiltInModelCard
            key={model.modelId}
            model={model}
            isEnabled={!disabledModelIds.has(model.modelId)}
            onToggle={() => handleToggleModel(model.modelId)}
          />
        ))}

        {filteredCustom.map((model) => (
          <CustomModelCard
            key={model.modelId}
            model={model}
            endpointName={resolveEndpointName(model.endpointId)}
            isEnabled={!disabledModelIds.has(model.modelId)}
            onToggle={() => handleToggleModel(model.modelId)}
            onEdit={() => handleEdit(model)}
            onDelete={() => handleDelete(model.modelId)}
          />
        ))}

        {noResults && (
          <div className="rounded-lg border border-derived-subtle p-4">
            <p className="text-center text-muted-foreground text-sm">
              No models match your filter.
            </p>
          </div>
        )}
      </OverlayScrollbar>

      <CustomModelDialog
        model={editingModel}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        existingModelIds={existingModelIds}
        customEndpoints={customEndpoints}
      />
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

function Page() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">
            Models & Providers
          </h1>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* API Keys Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">API Keys</h2>
              <p className="text-muted-foreground text-sm">
                Configure how the agent connects to LLM providers. Use your
                stagewise account, official provider endpoints, or custom URLs.
              </p>
            </div>

            <ModelProvidersSection />
          </section>

          <hr className="border-derived-subtle border-t" />

          {/* Models Section */}
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium text-foreground text-lg">Models</h2>
                <p className="text-muted-foreground text-sm">
                  Built-in models are shown for reference. Define additional
                  models that use built-in providers or custom endpoints.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate({ to: '/agent-settings/custom-providers' })
                  }
                >
                  Custom Providers
                  <IconChevronRightOutline18 className="size-3" />
                </Button>
              </div>
            </div>

            <CustomModelsSection />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}

function TruncatedErrorText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { isTruncated, tooltipOpen, setTooltipOpen } = useIsTruncated(ref);

  return (
    <Tooltip open={isTruncated && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger>
        <p ref={ref} className={cn('truncate text-2xs text-error-foreground')}>
          {text}
        </p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="wrap-break-word line-clamp-12 max-h-48 max-w-xs overflow-y-auto text-2xs leading-relaxed">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
