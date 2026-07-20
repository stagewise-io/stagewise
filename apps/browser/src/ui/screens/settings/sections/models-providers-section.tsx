import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import type {
  CustomModel,
  ModelCapabilities,
  ProviderInstance,
  ProviderInstanceTypeId,
  UserPreferences,
} from '@shared/karton-contracts/ui/shared-types';
import {
  DEFAULT_INSTANCE_ID,
  INSTANCE_TYPE_ID_TO_API_SPEC,
  getInstanceDisabledModelIds,
  getInstanceModelThinkingOverride,
  getInstanceThinkingDefaultOptions,
  getSelectableModelEntries,
  getTypeDisplayInfo,
  getVendorForInstance,
  resolveCustomModelInstanceName,
  type ModelSelectorEntry,
} from '@shared/provider-instance-helpers';
import {
  availableModelAliases,
  getAvailableModel,
} from '@shared/available-models';
import {
  getEnabledModelThinkingOption,
  getModelThinkingDisplayState,
  getModelThinkingOptions,
  type ModelThinkingDisplayState,
  type ModelThinkingDefaultOptions,
  type ThinkingPanelModel,
} from '@ui/utils/model-thinking';
import { ModelThinkingPanel } from '@ui/components/model-thinking-panel';
import { CODING_PLANS, type CodingPlanId } from '@shared/coding-plans';
import { ProviderLogo } from '@ui/components/provider-logos';
import { OllamaLogo } from '@ui/components/provider-logos/ollama';
import { OpenRouterLogo } from '@ui/components/provider-logos/openrouter';
import {
  groupEntriesByVendor,
  type VendorGroup,
} from '@ui/utils/vendor-grouping';
import {
  CustomEndpointConnection,
  CustomEndpointForm,
  endpointSaveDataToInstanceArgs,
  type EndpointSaveData,
} from './custom-providers-section';
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';

import { cn } from '@ui/utils';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import { Input } from '@stagewise/stage-ui/components/input';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
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
  IconChevronLeftOutline18,
  IconChevronDownOutline18,
  IconPlusOutline18,
  IconPenOutline18,
  IconTrashOutline18,
  IconChevronRightOutline18,
  IconFolderCloudOutline18,
  IconServerOutline18,
  IconArrowUpRightOutline18,
  IconDotsOutline18,
  IconRefreshAnticlockwiseOutline18,
  IconCheck2Outline18,
  IconBanOutline18,
} from '@stagewise/icons';
import { Logo } from '@stagewise/stage-ui/components/logo';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from '@stagewise/stage-ui/components/menu';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu as MenuBase } from '@base-ui/react/menu';

const consoleUrl =
  import.meta.env.VITE_STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

enablePatches();

const EMPTY_CUSTOM_MODELS: UserPreferences['customModels'] = [];

// =============================================================================
// Provider Instance Logo
// =============================================================================

function InstanceLogo({
  typeId,
  instance,
  className,
}: {
  typeId: ProviderInstanceTypeId;
  instance?: ProviderInstance;
  className?: string;
}) {
  // Vendor API types → brand logo
  if (typeId.endsWith('-api')) {
    const vendor = typeId.slice(0, -4);
    return (
      <ProviderLogo
        provider={vendor as Parameters<typeof ProviderLogo>[0]['provider']}
        className={className}
      />
    );
  }
  // Stagewise → stagewise logo
  if (typeId === 'stagewise') {
    return <Logo className={className} />;
  }
  // Coding plan → resolve the plan's provider logo
  if (typeId === 'coding-plan') {
    const planId = (instance?.config as { planId?: string })?.planId as
      | CodingPlanId
      | undefined;
    const plan = planId ? CODING_PLANS[planId] : undefined;
    if (plan) {
      return <ProviderLogo provider={plan.provider} className={className} />;
    }
    return (
      <IconServerOutline18 className={cn(className, 'text-muted-foreground')} />
    );
  }
  // Ollama self-hosted
  if (typeId === 'ollama') {
    return <OllamaLogo className={className} />;
  }
  // OpenRouter meta-provider
  if (typeId === 'openrouter') {
    return <OpenRouterLogo className={className} />;
  }
  // Cloud/custom types → cloud icon
  return (
    <IconFolderCloudOutline18
      className={cn(className, 'text-muted-foreground')}
    />
  );
}

// =============================================================================
// Vendor API Key Input (inline)
// =============================================================================

function VendorApiKeyInput({
  instance,
  onSaved,
}: {
  instance: ProviderInstance;
  onSaved?: () => void;
}) {
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const setProviderInstanceApiKey = useKartonProcedure(
    (p) => p.preferences.setProviderInstanceApiKey,
  );
  const clearProviderInstanceApiKey = useKartonProcedure(
    (p) => p.preferences.clearProviderInstanceApiKey,
  );
  const validateProviderInstanceApiKey = useKartonProcedure(
    (p) => p.preferences.validateProviderInstanceApiKey,
  );

  const hasKey = !!(instance.config as { encryptedApiKey?: string })
    .encryptedApiKey;
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validated, setValidated] = useState<
    null | { success: true } | { success: false; error: string }
  >(null);

  useEffect(() => {
    if (validated?.success) {
      const timer = setTimeout(() => setValidated(null), 2_000);
      return () => clearTimeout(timer);
    }
  }, [validated]);

  const handleSave = useCallback(
    async (key: string) => {
      if (!key.trim()) return;
      const trimmedKey = key.trim();
      setIsValidating(true);
      setValidated(null);
      try {
        const result = await validateProviderInstanceApiKey(
          instance.id,
          trimmedKey,
        );
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

      setIsSaving(true);
      try {
        await setProviderInstanceApiKey(instance.id, trimmedKey);
        setApiKeyInput('');
        setValidated({ success: true });
        onSaved?.();
      } finally {
        setIsSaving(false);
      }
    },
    [
      instance.id,
      validateProviderInstanceApiKey,
      setProviderInstanceApiKey,
      onSaved,
    ],
  );

  const handleClear = useCallback(async () => {
    await clearProviderInstanceApiKey(instance.id);
    setValidated(null);
  }, [instance.id, clearProviderInstanceApiKey]);

  const displayInfo = getTypeDisplayInfo(instance.typeId);
  const isCodingPlan = instance.typeId === 'coding-plan';
  const codingPlanId = isCodingPlan
    ? ((instance.config as { planId?: string })?.planId as
        | CodingPlanId
        | undefined)
    : undefined;
  const codingPlan = codingPlanId ? CODING_PLANS[codingPlanId] : undefined;
  const getApiKeyUrl = codingPlan?.apiKeyUrl ?? displayInfo?.getApiKeyUrl;
  const helpText = codingPlan?.helpText ?? displayInfo?.helpText;

  return (
    <div className="space-y-1">
      <p className="flex items-center font-medium text-muted-foreground text-xs">
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
              void handleSave(apiKeyInput);
            }
          }}
          onBlur={() => {
            if (apiKeyInput.trim()) {
              void handleSave(apiKeyInput);
            }
          }}
          disabled={isValidating || isSaving}
          size="sm"
          style={{ maxWidth: 'none' }}
          className="min-w-0 flex-1"
        />
        {apiKeyInput ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave(apiKeyInput)}
            disabled={isValidating || isSaving}
          >
            Save
          </Button>
        ) : hasKey ? (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
        ) : null}
      </div>
      {validated && !validated.success && (
        <TruncatedErrorText text={validated.error} />
      )}
      {!hasKey && !(validated && !validated.success) && getApiKeyUrl && (
        <p className="text-subtle-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            {helpText ?? `Get your ${displayInfo.displayName} API key`}
            <button
              type="button"
              onClick={() => void openExternalUrl(getApiKeyUrl)}
              className={cn(
                buttonVariants({ variant: 'link', size: 'xs' }),
                'shrink-0',
              )}
            >
              Create key
            </button>
          </span>
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Provider Instance Card
// =============================================================================

function ProviderInstanceCard({
  instance,
  onConfigure,
  onRename,
  onDelete,
}: {
  instance: ProviderInstance;
  onConfigure?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const subscription = useKartonState((s) => s.userAccount.subscription);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);

  const displayInfo = getTypeDisplayInfo(instance.typeId);
  const isStagewise = instance.typeId === 'stagewise';
  const plan = subscription?.plan;
  const isFreePlan = !plan || plan === 'free';
  const card = (
    <div
      className="cursor-pointer space-y-3 rounded-lg border border-derived bg-surface-1 p-3 transition-colors hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived"
      role="button"
      tabIndex={0}
      onClick={onConfigure}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onConfigure?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center">
            <InstanceLogo
              typeId={instance.typeId}
              instance={instance}
              className="size-5 text-foreground"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-foreground text-sm">
              {instance.name}
            </h3>
            {displayInfo?.description && (
              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                {displayInfo.description}
              </p>
            )}
          </div>
        </div>
        <div
          className="flex shrink-0 items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <IconChevronRightOutline18 className="size-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Stagewise upgrade CTA for free accounts. */}
      {isStagewise && isFreePlan && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-warning-foreground text-xs">
            Requires Pro or Ultra plan
          </p>
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              void openExternalUrl(consoleUrl);
            }}
          >
            Upgrade to Pro
            <IconArrowUpRightOutline18 className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );

  if (!onRename && !onDelete) return card;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={card} />
      <MenuBase.Portal>
        <MenuBase.Positioner
          className="z-50"
          sideOffset={4}
          align="start"
          side="bottom"
        >
          <MenuBase.Popup
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'text-xs shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            {onRename && (
              <MenuBase.Item
                className={cn(
                  'flex w-full cursor-default flex-row items-center justify-start gap-2',
                  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
                  'transition-colors duration-150 ease-out',
                  'hover:bg-surface-1 data-highlighted:bg-surface-1',
                )}
                onClick={onRename}
              >
                <IconPenOutline18 className="size-3.5 shrink-0" />
                <span>Rename provider</span>
              </MenuBase.Item>
            )}
            {onDelete && (
              <MenuBase.Item
                className={cn(
                  'flex w-full cursor-default flex-row items-center justify-start gap-2',
                  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
                  'transition-colors duration-150 ease-out',
                  'hover:bg-surface-1 data-highlighted:bg-surface-1',
                )}
                onClick={onDelete}
              >
                <IconTrashOutline18 className="size-3.5 shrink-0" />
                <span>Delete provider</span>
              </MenuBase.Item>
            )}
          </MenuBase.Popup>
        </MenuBase.Positioner>
      </MenuBase.Portal>
    </ContextMenu.Root>
  );
}

// =============================================================================
// Add Provider Type Grid
// =============================================================================

const ADDABLE_VENDOR_TYPES: ProviderInstanceTypeId[] = [
  'anthropic-api',
  'openai-api',
  'google-api',
  'deepseek-api',
  'z-ai-api',
  'moonshotai-api',
  'alibaba-api',
  'minimax-api',
  'xiaomi-mimo-api',
  'mistral-api',
];

const ADDABLE_GATEWAY_TYPES: ProviderInstanceTypeId[] = ['openrouter'];

const ADDABLE_SELF_HOSTED_TYPES: ProviderInstanceTypeId[] = ['ollama'];

/** Unified selection key — a provider typeId, coding plan, or custom flow. */
type SelectionKey = ProviderInstanceTypeId | `plan:${string}` | 'custom';

function AddProviderGrid({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (instanceId: string) => void;
}) {
  const addProviderInstance = useKartonProcedure(
    (p) => p.preferences.addProviderInstance,
  );
  const setProviderInstanceSecretKey = useKartonProcedure(
    (p) => p.preferences.setProviderInstanceSecretKey,
  );
  const setProviderInstanceGoogleCredentials = useKartonProcedure(
    (p) => p.preferences.setProviderInstanceGoogleCredentials,
  );
  const preferences = useKartonState((s) => s.preferences);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const [selected, setSelected] = useState<SelectionKey | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the dialog opens.
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const existingInstances = preferences.providerInstances ?? [];

  const instanceCountByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of existingInstances) {
      counts.set(instance.typeId, (counts.get(instance.typeId) ?? 0) + 1);
    }
    return counts;
  }, [existingInstances]);

  const codingPlans = useMemo(() => Object.values(CODING_PLANS), []);
  const instanceCountByPlan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of existingInstances) {
      if (instance.typeId !== 'coding-plan') continue;
      const planId = (instance.config as { planId?: string }).planId;
      if (planId) counts.set(planId, (counts.get(planId) ?? 0) + 1);
    }
    return counts;
  }, [existingInstances]);

  const handleConnect = useCallback(
    async (key: SelectionKey, value: string) => {
      if (!value.trim()) return;
      setIsConnecting(true);
      setError(null);
      try {
        const planId = key.startsWith('plan:')
          ? (key.slice(5) as CodingPlanId)
          : undefined;
        const plan = planId ? CODING_PLANS[planId] : undefined;
        const isSelfHosted = ADDABLE_SELF_HOSTED_TYPES.includes(
          key as ProviderInstanceTypeId,
        );

        const result = await addProviderInstance({
          typeId: plan ? 'coding-plan' : key,
          config: plan
            ? { planId: plan.id, baseUrl: plan.baseUrl }
            : isSelfHosted
              ? { baseUrl: value.trim() }
              : {},
          validateApiKey: isSelfHosted ? undefined : value.trim(),
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        onConnected(result.instanceId);
      } catch {
        setError('Connection failed. Please try again.');
      } finally {
        setIsConnecting(false);
      }
    },
    [addProviderInstance, onConnected],
  );

  // Resolve display info for the current selection
  const selectedVendorType =
    selected && selected !== 'custom' && !selected.startsWith('plan:')
      ? (selected as ProviderInstanceTypeId)
      : null;
  const selectedPlanId = selected?.startsWith('plan:')
    ? (selected.slice(5) as CodingPlanId)
    : null;
  const selectedPlan = selectedPlanId
    ? CODING_PLANS[selectedPlanId]
    : undefined;
  const selectedVendorInfo = selectedVendorType
    ? getTypeDisplayInfo(selectedVendorType)
    : undefined;
  const selectedDisplayName =
    selectedVendorInfo?.displayName ?? selectedPlan?.displayName ?? '';
  const selectedTagline =
    selectedPlan?.tagline ?? selectedVendorInfo?.description ?? '';
  const selectedGetApiKeyUrl =
    selectedVendorInfo?.getApiKeyUrl ?? selectedPlan?.apiKeyUrl;
  const selectedHelpText =
    selectedPlan?.helpText ??
    selectedVendorInfo?.helpText ??
    (selectedGetApiKeyUrl
      ? `Get your ${selectedDisplayName} API key`
      : undefined);
  const selectedEndpointHelpText = selectedPlan?.endpointHelpText;
  const selectedDisclaimer = selectedPlan?.disclaimer;

  const isSelfHosted =
    selectedVendorType &&
    ADDABLE_SELF_HOSTED_TYPES.includes(selectedVendorType);

  const handleBack = useCallback(() => {
    setSelected(null);
    setApiKey('');
    setSearchQuery('');
    setError(null);
  }, []);

  // Filter providers by search query.
  const query = searchQuery.trim().toLowerCase();
  const filterTypes = (types: ProviderInstanceTypeId[]) =>
    query
      ? types.filter((typeId) => {
          const info = getTypeDisplayInfo(typeId);
          return info.displayName.toLowerCase().includes(query);
        })
      : types;
  const filteredVendorTypes = filterTypes(ADDABLE_VENDOR_TYPES);
  const filteredGatewayTypes = filterTypes(ADDABLE_GATEWAY_TYPES);
  const filteredCodingPlans = query
    ? codingPlans.filter((plan) =>
        plan.displayName.toLowerCase().includes(query),
      )
    : codingPlans;
  const filteredSelfHostedTypes = filterTypes(ADDABLE_SELF_HOSTED_TYPES);
  const customProviderMatches =
    !query ||
    'custom provider'.includes(query) ||
    'custom endpoint'.includes(query);
  const noResults =
    query.length > 0 &&
    filteredVendorTypes.length === 0 &&
    filteredCodingPlans.length === 0 &&
    filteredGatewayTypes.length === 0 &&
    filteredSelfHostedTypes.length === 0 &&
    !customProviderMatches;

  const handleAddCustomProvider = useCallback(
    async (data: EndpointSaveData) => {
      const { typeId, name, config } = endpointSaveDataToInstanceArgs(data);
      const result = await addProviderInstance({
        typeId,
        name,
        config,
        validateApiKey: data.apiKey || undefined,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      if (data.secretKey) {
        await setProviderInstanceSecretKey(result.instanceId, data.secretKey);
      }
      if (data.googleCredentials) {
        await setProviderInstanceGoogleCredentials(
          result.instanceId,
          data.googleCredentials,
        );
      }
      onConnected(result.instanceId);
    },
    [
      addProviderInstance,
      onConnected,
      setProviderInstanceGoogleCredentials,
      setProviderInstanceSecretKey,
    ],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogClose />
        <DialogHeader>
          {selected ? (
            <DialogTitle className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={handleBack}>
                <IconChevronLeftOutline18 className="size-4" />
              </Button>
              {selected === 'custom'
                ? 'Add Custom Provider'
                : `Connect ${selectedDisplayName}`}
            </DialogTitle>
          ) : (
            <>
              <DialogTitle>Add Provider</DialogTitle>
              <DialogDescription>
                Connect an API key, coding plan, or custom endpoint.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {selected === 'custom' ? (
          <CustomEndpointForm
            onSave={handleAddCustomProvider}
            onCancel={handleBack}
            showFooterDivider={false}
          />
        ) : selected ? (
          /* Step 2: Connection details for the selected provider */
          <div className="space-y-4">
            <div className="space-y-3 pt-1 pb-4">
              {/* Provider header: logo + name + tagline */}
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-1">
                  {selectedVendorType ? (
                    <InstanceLogo
                      typeId={selectedVendorType}
                      className="size-5 text-foreground"
                    />
                  ) : selectedPlan ? (
                    <ProviderLogo
                      provider={selectedPlan.provider}
                      className="size-5 text-foreground"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-foreground text-sm">
                    {selectedDisplayName}
                  </h3>
                  {selectedTagline && (
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {selectedTagline}
                    </p>
                  )}
                </div>
              </div>

              <Input
                autoFocus
                type={isSelfHosted ? 'text' : 'password'}
                placeholder={
                  isSelfHosted ? 'Enter base URL...' : 'Enter API key...'
                }
                value={apiKey}
                onValueChange={(v) => {
                  setApiKey(v);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiKey.trim()) {
                    void handleConnect(selected, apiKey);
                  }
                }}
                disabled={isConnecting}
                aria-invalid={error ? true : undefined}
                size="sm"
                style={{ maxWidth: 'none' }}
                className={cn(error && 'border-error-foreground')}
              />

              {error && <TruncatedErrorText text={error} />}

              {!error && !isSelfHosted && selectedHelpText && (
                <p className="text-subtle-foreground text-xs">
                  <span className="inline-flex items-center gap-1">
                    {selectedHelpText}
                    {selectedGetApiKeyUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          void openExternalUrl(selectedGetApiKeyUrl)
                        }
                        className={cn(
                          buttonVariants({ variant: 'link', size: 'xs' }),
                          'shrink-0',
                        )}
                      >
                        Create key
                      </button>
                    )}
                  </span>
                  {selectedEndpointHelpText && (
                    <span className="mt-0.5 block text-2xs text-subtle-foreground">
                      {selectedEndpointHelpText}
                    </span>
                  )}
                </p>
              )}

              {!error && isSelfHosted && (
                <p className="text-subtle-foreground text-xs">
                  Enter the base URL of your Ollama instance. Default is
                  http://localhost:11434.
                </p>
              )}

              {selectedDisclaimer && (
                <p className="text-2xs text-warning-foreground">
                  {selectedDisclaimer}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!apiKey.trim() || isConnecting}
                onClick={() => void handleConnect(selected, apiKey)}
              >
                {isConnecting
                  ? 'Connecting...'
                  : isSelfHosted
                    ? 'Discover'
                    : 'Connect'}
              </Button>
            </div>
          </div>
        ) : (
          /* Step 1: Provider selection grid */
          <>
            <div className="px-0 pb-3">
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search providers..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="w-full"
              />
            </div>
            <OverlayScrollbar className="h-72">
              <div className="space-y-4 px-0.5 pr-2">
                {noResults && (
                  <p className="py-4 text-center text-muted-foreground text-xs">
                    No providers match &quot;{query}&quot;
                  </p>
                )}

                {/* Coding Plans */}
                {filteredCodingPlans.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground text-xs">
                      Coding Plans
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredCodingPlans.map((plan) => {
                        const instanceCount =
                          instanceCountByPlan.get(plan.id) ?? 0;
                        const planKey = `plan:${plan.id}` as SelectionKey;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => {
                              setSelected(planKey);
                              setApiKey('');
                              setError(null);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                              'border-derived hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived',
                            )}
                          >
                            <ProviderLogo
                              provider={plan.provider}
                              className="size-4 shrink-0 text-foreground"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground text-xs">
                              {plan.displayName}
                            </span>
                            {instanceCount > 0 && (
                              <span className="shrink-0 text-2xs text-subtle-foreground">
                                {instanceCount} connected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Gateways */}
                {filteredGatewayTypes.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground text-xs">
                      Gateways
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredGatewayTypes.map((typeId) => {
                        const info = getTypeDisplayInfo(typeId);
                        const instanceCount =
                          instanceCountByType.get(typeId) ?? 0;
                        return (
                          <button
                            key={typeId}
                            type="button"
                            onClick={() => {
                              setSelected(typeId);
                              setApiKey('');
                              setError(null);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                              'border-derived hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived',
                            )}
                          >
                            <InstanceLogo
                              typeId={typeId}
                              className="size-4 shrink-0 text-foreground"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground text-xs">
                              {info.displayName}
                            </span>
                            {instanceCount > 0 && (
                              <span className="shrink-0 text-2xs text-subtle-foreground">
                                {instanceCount} connected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Self-Hosted */}
                {filteredSelfHostedTypes.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground text-xs">
                      Self-Hosted
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredSelfHostedTypes.map((typeId) => {
                        const info = getTypeDisplayInfo(typeId);
                        const instanceCount =
                          instanceCountByType.get(typeId) ?? 0;
                        return (
                          <button
                            key={typeId}
                            type="button"
                            onClick={() => {
                              setSelected(typeId);
                              setApiKey(info.defaultBaseUrl ?? '');
                              setError(null);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                              'border-derived hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived',
                            )}
                          >
                            <InstanceLogo
                              typeId={typeId}
                              className="size-4 shrink-0 text-foreground"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground text-xs">
                              {info.displayName}
                            </span>
                            {instanceCount > 0 && (
                              <span className="shrink-0 text-2xs text-subtle-foreground">
                                {instanceCount} connected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Vendor API types */}
                {filteredVendorTypes.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground text-xs">
                      Official API Keys
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredVendorTypes.map((typeId) => {
                        const info = getTypeDisplayInfo(typeId);
                        const instanceCount =
                          instanceCountByType.get(typeId) ?? 0;
                        return (
                          <button
                            key={typeId}
                            type="button"
                            onClick={() => {
                              setSelected(typeId);
                              setApiKey('');
                              setError(null);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                              'border-derived hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived',
                            )}
                          >
                            <InstanceLogo
                              typeId={typeId}
                              className="size-4 shrink-0 text-foreground"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground text-xs">
                              {info.displayName}
                            </span>
                            {instanceCount > 0 && (
                              <span className="shrink-0 text-2xs text-subtle-foreground">
                                {instanceCount} connected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {customProviderMatches && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground text-xs">
                      Custom endpoint
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected('custom');
                        setError(null);
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                        'border-derived hover:bg-hover-derived focus-visible:bg-hover-derived active:bg-active-derived',
                      )}
                    >
                      <IconPlusOutline18 className="size-4 shrink-0 text-foreground" />
                      <span className="min-w-0 flex-1 text-foreground text-xs">
                        Add custom provider
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </OverlayScrollbar>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Provider Instances Section
// =============================================================================

function ProviderInstancesSection({
  onConfigure,
  onRename,
  onDelete,
}: {
  onConfigure: (instanceId: string) => void;
  onRename: (instanceId: string) => void;
  onDelete: (instanceId: string) => void;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const instances = preferences.providerInstances ?? [];
  const [showAddProvider, setShowAddProvider] = useState(false);

  // Sort: stagewise first, then coding-plan, then vendor-api, then custom
  const sortedInstances = useMemo(() => {
    const getOrder = (typeId: string) => {
      if (typeId === 'stagewise') return 0;
      if (typeId === 'coding-plan') return 1;
      if (typeId.endsWith('-api')) return 2;
      return 3;
    };
    return [...instances].sort(
      (a, b) => getOrder(a.typeId) - getOrder(b.typeId),
    );
  }, [instances]);

  return (
    <div className="space-y-3">
      {sortedInstances.map((instance) => (
        <ProviderInstanceCard
          key={instance.id}
          instance={instance}
          onConfigure={() => onConfigure(instance.id)}
          onRename={
            instance.typeId !== 'stagewise'
              ? () => onRename(instance.id)
              : undefined
          }
          onDelete={
            instance.id !== DEFAULT_INSTANCE_ID
              ? () => onDelete(instance.id)
              : undefined
          }
        />
      ))}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddProvider(true)}
        >
          <IconPlusOutline18 className="size-3.5" />
          Add Provider
        </Button>
      </div>

      {showAddProvider && (
        <AddProviderGrid
          onClose={() => setShowAddProvider(false)}
          onConnected={(instanceId) => {
            setShowAddProvider(false);
            onConfigure(instanceId);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Model Components
// =============================================================================

const BUILT_IN_MODEL_IDS = new Set(
  availableModelAliases.map((a) => a.modelId),
) as Set<string>;

function CustomModelDialog({
  model,
  open,
  onOpenChange,
  onSave,
  existingModelIds,
  providerInstances,
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
  providerInstances: ProviderInstance[];
}) {
  const track = useTrack();
  const isAddMode = !model;
  const savedRef = useRef(false);

  const [modelId, setModelId] = useState(model?.modelId ?? '');
  const [displayName, setDisplayName] = useState(model?.displayName ?? '');
  const [description, setDescription] = useState(model?.description ?? '');
  const [contextWindowSize, setContextWindowSize] = useState(
    model?.contextWindowSize ?? 128000,
  );
  const [providerInstanceId, setProviderInstanceId] = useState(
    model?.providerInstanceId ?? model?.endpointId ?? '',
  );
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

  useEffect(() => {
    if (!open) return;
    setModelId(model?.modelId ?? '');
    setDisplayName(model?.displayName ?? '');
    setDescription(model?.description ?? '');
    setContextWindowSize(model?.contextWindowSize ?? 128000);
    setProviderInstanceId(model?.providerInstanceId ?? model?.endpointId ?? '');
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
    savedRef.current = false;
    if (isAddMode) {
      track('custom-model-add-started');
    }
  }, [open]);

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

  const anyFieldTouched =
    modelId !== (model?.modelId ?? '') ||
    displayName !== (model?.displayName ?? '') ||
    description !== (model?.description ?? '') ||
    contextWindowSize !== (model?.contextWindowSize ?? 128000) ||
    providerInstanceId !==
      (model?.providerInstanceId ?? model?.endpointId ?? '') ||
    thinkingEnabled !== (model?.thinkingEnabled ?? false) ||
    providerOptionsJson !==
      (model?.providerOptions && Object.keys(model.providerOptions).length > 0
        ? JSON.stringify(model.providerOptions, null, 2)
        : '') ||
    headersJson !==
      (model?.headers && Object.keys(model.headers).length > 0
        ? JSON.stringify(model.headers, null, 2)
        : '') ||
    JSON.stringify(capabilities) !==
      JSON.stringify(model?.capabilities ?? defaultCaps);

  const hadValidationErrors = isDuplicate || jsonError !== null;

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && open && isAddMode && !savedRef.current) {
      track('custom-model-add-aborted', {
        had_validation_errors: hadValidationErrors,
        any_field_touched: anyFieldTouched,
      });
    }
    onOpenChange(next);
  };

  const endpointOptions = useMemo(() => {
    return providerInstances
      .filter((i) => i.typeId !== 'stagewise')
      .map((inst) => ({
        value: inst.id,
        label: inst.name,
        group: inst.typeId.endsWith('-api')
          ? 'Built-in'
          : inst.typeId === 'coding-plan'
            ? 'Coding Plan'
            : 'Custom',
      }));
  }, [providerInstances]);

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
      providerInstanceId,
      thinkingEnabled,
      capabilities,
      providerOptions,
      headers,
    });
    if (isAddMode) {
      track('custom-model-add-finished');
    }
    savedRef.current = true;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-md">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>{model ? 'Edit Model' : 'Add Custom Model'}</DialogTitle>
          <DialogDescription>
            Define a model and assign it to a provider or custom endpoint.
          </DialogDescription>
        </DialogHeader>

        <OverlayScrollbar
          className="min-h-0 flex-1"
          viewportClassName="scroll-fade-y scroll-fade-6"
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
              <ModelEndpointSelect
                value={providerInstanceId}
                onChange={setProviderInstanceId}
                options={endpointOptions}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDialogOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simple native select for endpoint assignment in the custom model dialog.
 * Wraps a styled <select> to avoid importing the full stage-ui Select
 * (which requires an items prop with group support we don't need here).
 */
function ModelEndpointSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; group: string }[];
}) {
  // Group options
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof options>();
    for (const opt of options) {
      const arr = groups.get(opt.group) ?? [];
      arr.push(opt);
      groups.set(opt.group, arr);
    }
    return Array.from(groups.entries());
  }, [options]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-derived bg-background px-2 py-1.5 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
    >
      <option value="">Select an endpoint...</option>
      {grouped.map(([group, opts]) => (
        <optgroup key={group} label={group}>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// =============================================================================
// Per-Instance Model List
// =============================================================================

/**
 * Compute the thinking display state for a model-selector entry.
 * Shared by `InstanceModelGroup` and `VendorModelGroup` to avoid
 * duplicating the catalog-vs-discovered branching logic.
 */
function computeEntryThinkingDisplay(
  entry: ModelSelectorEntry,
  instance: ProviderInstance,
  preferences: UserPreferences,
  thinkingDefaultOptions: ModelThinkingDefaultOptions,
): ModelThinkingDisplayState | null {
  const override = getInstanceModelThinkingOverride(
    preferences,
    instance.id,
    entry.modelId,
  );
  const catalogModel = entry.catalogModel;
  if (catalogModel) {
    return getModelThinkingDisplayState(
      catalogModel,
      override,
      thinkingDefaultOptions,
    );
  }
  if (entry.thinkingEnabled) {
    return getModelThinkingDisplayState(
      {
        modelId: entry.targetModelId,
        modelDisplayName: entry.displayName,
        providerOptions: {},
        officialProvider:
          getInstanceThinkingDefaultOptions(instance).modelProvider ??
          getVendorForInstance(instance),
        thinkingEnabled: true,
      },
      override,
      thinkingDefaultOptions,
    );
  }
  return null;
}

function BuiltInModelCard({
  model,
  isEnabled,
  thinkingDisplay,
  onToggle,
  onEditThinking,
  vendorLabelOverride,
}: {
  model: ModelSelectorEntry;
  isEnabled: boolean;
  thinkingDisplay: ModelThinkingDisplayState | null;
  onToggle: () => void;
  onEditThinking: (event: React.MouseEvent<HTMLElement>) => void;
  vendorLabelOverride?: string;
}) {
  const vendorLabel =
    vendorLabelOverride ??
    (model.catalogModel?.officialProvider
      ? getTypeDisplayInfo(
          `${model.catalogModel.officialProvider}-api` as ProviderInstanceTypeId,
        ).displayName
      : model.instanceName);

  return (
    <div
      data-model-card
      className={cn(
        'group/model-card cursor-pointer rounded-lg border border-derived bg-surface-1 p-3',
        !isEnabled && 'opacity-60',
      )}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="-mt-1 min-w-0 flex-1">
          <h3 className="font-medium text-foreground text-sm">
            {model.displayName}
            {thinkingDisplay && (
              <span className="ml-1.5 font-normal text-subtle-foreground">
                {thinkingDisplay.label}
              </span>
            )}
          </h3>
          <p className="text-muted-foreground text-xs">
            {model.modelId} &middot; {vendorLabel} &middot; {model.contextLabel}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {thinkingDisplay && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-thinking-edit-trigger
              className="h-5 px-1.5 opacity-0 transition-opacity group-focus-within/model-card:opacity-100 group-hover/model-card:opacity-100"
              onClick={onEditThinking}
            >
              Edit
            </Button>
          )}
          <Switch
            checked={isEnabled}
            onCheckedChange={() => onToggle()}
            size="xs"
            aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${model.displayName}`}
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
            <IconPenOutline18 className="size-4" />
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
            aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${model.displayName}`}
          />
        </div>
      </div>
    </div>
  );
}

function InstanceModelGroup({
  instance,
  entries,
  preferences,
  onToggleModel,
  onEditThinking,
  onEditCustomModel,
  onDeleteCustomModel,
}: {
  instance: ProviderInstance;
  entries: ModelSelectorEntry[];
  preferences: UserPreferences;
  onToggleModel: (instanceId: string, modelId: string) => void;
  onEditThinking: (
    instanceId: string,
    modelId: string,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  onEditCustomModel: (model: CustomModel) => void;
  onDeleteCustomModel: (modelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const disabledSet = useMemo(
    () => new Set(getInstanceDisabledModelIds(preferences, instance.id)),
    [preferences, instance.id],
  );

  const customModels = preferences.customModels ?? EMPTY_CUSTOM_MODELS;
  const instanceCustomModels = customModels.filter(
    (m) => (m.providerInstanceId ?? m.endpointId) === instance.id,
  );

  const thinkingDefaultOptions: ModelThinkingDefaultOptions = useMemo(
    () => getInstanceThinkingDefaultOptions(instance),
    [instance],
  );

  const handleEditThinking = useCallback(
    (modelId: string, event: React.MouseEvent<HTMLElement>) => {
      onEditThinking(instance.id, modelId, event);
    },
    [instance.id, onEditThinking],
  );

  return (
    <div className="space-y-2">
      {/* Instance header */}
      <button
        type="button"
        className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <InstanceLogo
          typeId={instance.typeId}
          instance={instance}
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-all group-hover:text-foreground group-hover:filter-none',
            'opacity-60 grayscale group-hover:opacity-100',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs transition-colors group-hover:text-foreground">
          {instance.name}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground transition-colors group-hover:text-foreground">
          {entries.length + instanceCustomModels.length} models
        </span>
        <IconChevronDownOutline18
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-colors transition-transform group-hover:text-foreground',
            !expanded && '-rotate-90',
          )}
        />
      </button>

      {/* Model list */}
      {expanded && (
        <div className="space-y-2 pl-1">
          {(() => {
            const vendorGroups = groupEntriesByVendor(entries, instance);
            if (vendorGroups) {
              return vendorGroups.map((vg) => {
                const VendorLogo = vg.logo;
                return (
                  <div key={vg.prefix || 'other'} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 py-0.5">
                      <VendorLogo
                        aria-label={vg.displayName}
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                      <span className="font-medium text-2xs text-muted-foreground">
                        {vg.displayName}
                      </span>
                    </div>
                    {vg.entries.map((entry) => (
                      <BuiltInModelCard
                        key={entry.modelId}
                        model={entry}
                        isEnabled={!disabledSet.has(entry.modelId)}
                        thinkingDisplay={computeEntryThinkingDisplay(
                          entry,
                          instance,
                          preferences,
                          thinkingDefaultOptions,
                        )}
                        onToggle={() =>
                          onToggleModel(instance.id, entry.modelId)
                        }
                        onEditThinking={(e) =>
                          handleEditThinking(entry.modelId, e)
                        }
                        vendorLabelOverride={vg.displayName}
                      />
                    ))}
                  </div>
                );
              });
            }
            return entries.map((entry) => (
              <BuiltInModelCard
                key={entry.modelId}
                model={entry}
                isEnabled={!disabledSet.has(entry.modelId)}
                thinkingDisplay={computeEntryThinkingDisplay(
                  entry,
                  instance,
                  preferences,
                  thinkingDefaultOptions,
                )}
                onToggle={() => onToggleModel(instance.id, entry.modelId)}
                onEditThinking={(e) => handleEditThinking(entry.modelId, e)}
              />
            ));
          })()}

          {/* Custom models for this instance */}
          {instanceCustomModels.map((model) => (
            <CustomModelCard
              key={model.modelId}
              model={model}
              endpointName={resolveCustomModelInstanceName(preferences, {
                providerInstanceId: model.providerInstanceId,
                endpointId: model.endpointId,
              })}
              isEnabled={!disabledSet.has(model.modelId)}
              onToggle={() => onToggleModel(instance.id, model.modelId)}
              onEdit={() => onEditCustomModel(model)}
              onDelete={() => onDeleteCustomModel(model.modelId)}
            />
          ))}

          {entries.length === 0 && instanceCustomModels.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground text-xs">
              No models available for this instance.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Model Card List
// =============================================================================

function ModelCardList({
  instance,
  entries,
  preferences,
  onToggleModel,
  onEditThinking,
  onEditCustomModel,
  onDeleteCustomModel,
  vendorLabelOverride,
}: {
  instance: ProviderInstance;
  entries: ModelSelectorEntry[];
  preferences: UserPreferences;
  onToggleModel: (instanceId: string, modelId: string) => void;
  onEditThinking: (
    instanceId: string,
    modelId: string,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  onEditCustomModel: (model: CustomModel) => void;
  onDeleteCustomModel: (modelId: string) => void;
  vendorLabelOverride?: string;
}) {
  const disabledSet = useMemo(
    () => new Set(getInstanceDisabledModelIds(preferences, instance.id)),
    [preferences, instance.id],
  );
  const customModelsById = useMemo(() => {
    const models = preferences.customModels ?? EMPTY_CUSTOM_MODELS;
    return new Map(
      models
        .filter(
          (model) =>
            (model.providerInstanceId ?? model.endpointId) === instance.id,
        )
        .map((model) => [model.modelId, model]),
    );
  }, [preferences.customModels, instance.id]);

  const thinkingDefaultOptions = useMemo(
    () => getInstanceThinkingDefaultOptions(instance),
    [instance],
  );

  const handleEditThinking = useCallback(
    (modelId: string, event: React.MouseEvent<HTMLElement>) => {
      onEditThinking(instance.id, modelId, event);
    },
    [instance.id, onEditThinking],
  );

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const customModel = customModelsById.get(entry.modelId);
        return customModel ? (
          <CustomModelCard
            key={entry.modelId}
            model={customModel}
            endpointName={resolveCustomModelInstanceName(preferences, {
              providerInstanceId: customModel.providerInstanceId,
              endpointId: customModel.endpointId,
            })}
            isEnabled={!disabledSet.has(entry.modelId)}
            onToggle={() => onToggleModel(instance.id, entry.modelId)}
            onEdit={() => onEditCustomModel(customModel)}
            onDelete={() => onDeleteCustomModel(customModel.modelId)}
          />
        ) : (
          <BuiltInModelCard
            key={entry.modelId}
            model={entry}
            isEnabled={!disabledSet.has(entry.modelId)}
            thinkingDisplay={computeEntryThinkingDisplay(
              entry,
              instance,
              preferences,
              thinkingDefaultOptions,
            )}
            onToggle={() => onToggleModel(instance.id, entry.modelId)}
            onEditThinking={(e) => handleEditThinking(entry.modelId, e)}
            vendorLabelOverride={vendorLabelOverride}
          />
        );
      })}
    </div>
  );
}

// =============================================================================
// Vendor Model Group (OpenRouter detail page)
// =============================================================================

function VendorModelGroup({
  instance,
  group,
  preferences,
  onToggleModel,
  onEditThinking,
  onEditCustomModel,
  onDeleteCustomModel,
  defaultExpanded,
}: {
  instance: ProviderInstance;
  group: VendorGroup;
  preferences: UserPreferences;
  onToggleModel: (instanceId: string, modelId: string) => void;
  onEditThinking: (
    instanceId: string,
    modelId: string,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  onEditCustomModel: (model: CustomModel) => void;
  onDeleteCustomModel: (modelId: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const disabledSet = useMemo(
    () => new Set(getInstanceDisabledModelIds(preferences, instance.id)),
    [preferences, instance.id],
  );
  const enabledCount = group.entries.reduce(
    (count, entry) => count + Number(!disabledSet.has(entry.modelId)),
    0,
  );

  const VendorLogo = group.logo;

  return (
    <div className="space-y-2">
      {/* Vendor header */}
      <button
        type="button"
        className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <VendorLogo
          aria-label={group.displayName}
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-all group-hover:text-foreground group-hover:filter-none',
            'opacity-60 grayscale group-hover:opacity-100',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs transition-colors group-hover:text-foreground">
          {group.displayName}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground transition-colors group-hover:text-foreground">
          {enabledCount} of {group.entries.length} enabled
        </span>
        <IconChevronDownOutline18
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-colors transition-transform group-hover:text-foreground',
            !expanded && '-rotate-90',
          )}
        />
      </button>

      {/* Model list */}
      {expanded && (
        <ModelCardList
          instance={instance}
          entries={group.entries}
          preferences={preferences}
          onToggleModel={onToggleModel}
          onEditThinking={onEditThinking}
          onEditCustomModel={onEditCustomModel}
          onDeleteCustomModel={onDeleteCustomModel}
          vendorLabelOverride={group.displayName}
        />
      )}
    </div>
  );
}

// =============================================================================
// Models Section (per-instance)
// =============================================================================

function ModelsSection({
  filterInstanceId,
  filterInstance,
}: {
  filterInstanceId?: string;
  filterInstance?: ProviderInstance;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const refreshInstanceModels = useKartonProcedure(
    (p) => p.preferences.refreshInstanceModels,
  );

  const isTrulyCustom =
    !!filterInstance && filterInstance.typeId in INSTANCE_TYPE_ID_TO_API_SPEC;
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const handleReloadModels = useCallback(async () => {
    if (!filterInstance) return;
    setIsReloading(true);
    setReloadError(null);
    try {
      await refreshInstanceModels(filterInstance.id);
    } catch (error) {
      setReloadError(
        error instanceof Error ? error.message : 'Failed to reload models.',
      );
    } finally {
      setIsReloading(false);
    }
  }, [filterInstance, refreshInstanceModels]);

  const customModels = preferences?.customModels ?? EMPTY_CUSTOM_MODELS;
  const providerInstances = preferences?.providerInstances ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<CustomModel | undefined>(
    undefined,
  );

  const existingModelIds = useMemo(
    () => new Set(customModels.map((m) => m.modelId)),
    [customModels],
  );

  const [searchQuery, setSearchQuery] = useState('');

  // Group selectable entries by instance
  const allEntries = useMemo(
    () => getSelectableModelEntries(preferences, { includeDisabled: true }),
    [preferences],
  );
  const instanceEntries = useMemo(
    () =>
      filterInstanceId
        ? allEntries.filter((entry) => entry.instanceId === filterInstanceId)
        : [],
    [allEntries, filterInstanceId],
  );
  const instanceDisabledSet = useMemo(
    () =>
      new Set(
        filterInstanceId
          ? getInstanceDisabledModelIds(preferences, filterInstanceId)
          : [],
      ),
    [preferences, filterInstanceId],
  );
  const hasInstanceModels = instanceEntries.length > 0;
  const allInstanceModelsEnabled =
    hasInstanceModels &&
    instanceEntries.every((entry) => !instanceDisabledSet.has(entry.modelId));
  const allInstanceModelsDisabled =
    hasInstanceModels &&
    instanceEntries.every((entry) => instanceDisabledSet.has(entry.modelId));

  const groupedByInstance = useMemo(() => {
    const groups = new Map<
      string,
      { instance: ProviderInstance; entries: ModelSelectorEntry[] }
    >();
    for (const entry of allEntries) {
      const inst = providerInstances.find((i) => i.id === entry.instanceId);
      if (!inst) continue;
      let group = groups.get(entry.instanceId);
      if (!group) {
        group = { instance: inst, entries: [] };
        groups.set(entry.instanceId, group);
      }
      group.entries.push(entry);
    }
    return Array.from(groups.values());
  }, [allEntries, providerInstances]);

  const filteredGroups = useMemo(() => {
    const groups = filterInstanceId
      ? groupedByInstance.filter((g) => g.instance.id === filterInstanceId)
      : groupedByInstance;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter(
          (e) =>
            e.displayName.toLowerCase().includes(q) ||
            e.modelId.toLowerCase().includes(q) ||
            e.instanceName.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groupedByInstance, searchQuery, filterInstanceId]);

  const noResults =
    searchQuery.trim().length > 0 && filteredGroups.length === 0;

  // --- Thinking panel state ---
  const [listScrollViewport, setListScrollViewport] =
    useState<HTMLElement | null>(null);

  const listContainerRef = useRef<HTMLDivElement>(null);
  const thinkingPanelRef = useRef<HTMLDivElement>(null);
  const thinkingPanelAnchorRef = useRef<HTMLElement | null>(null);
  const [thinkingPanelModelId, setThinkingPanelModelId] = useState<
    string | null
  >(null);
  const [thinkingPanelInstanceId, setThinkingPanelInstanceId] = useState<
    string | null
  >(null);
  const [thinkingPanelCenterY, setThinkingPanelCenterY] = useState(0);
  const [thinkingPanelOffset, setThinkingPanelOffset] = useState(0);
  const [thinkingPanelLeft, setThinkingPanelLeft] = useState(0);
  const [thinkingPanelSide, setThinkingPanelSide] = useState<'left' | 'right'>(
    'right',
  );

  const thinkingPanelModel = useMemo<ThinkingPanelModel | undefined>(() => {
    if (!thinkingPanelModelId) return undefined;
    const catalogModel = getAvailableModel(thinkingPanelModelId);
    if (catalogModel) return catalogModel;
    // Discovered model — construct a ThinkingPanelModel from the instance
    if (thinkingPanelInstanceId) {
      const instance = providerInstances.find(
        (i) => i.id === thinkingPanelInstanceId,
      );
      if (instance) {
        const entries = getSelectableModelEntries(preferences);
        const entry = entries.find(
          (e) =>
            e.instanceId === thinkingPanelInstanceId &&
            e.modelId === thinkingPanelModelId,
        );
        if (entry?.thinkingEnabled) {
          return {
            modelId: entry.targetModelId,
            modelDisplayName: entry.displayName,
            providerOptions: {},
            officialProvider:
              getInstanceThinkingDefaultOptions(instance).modelProvider ??
              getVendorForInstance(instance),
            thinkingEnabled: true,
          };
        }
      }
    }
    return undefined;
  }, [
    thinkingPanelModelId,
    thinkingPanelInstanceId,
    providerInstances,
    preferences,
  ]);

  const thinkingPanelInstance = useMemo(
    () =>
      thinkingPanelInstanceId
        ? providerInstances.find((i) => i.id === thinkingPanelInstanceId)
        : undefined,
    [thinkingPanelInstanceId, providerInstances],
  );

  const thinkingPanelDefaultOptions = useMemo(
    () =>
      thinkingPanelInstance
        ? getInstanceThinkingDefaultOptions(thinkingPanelInstance)
        : undefined,
    [thinkingPanelInstance],
  );

  const thinkingPanelOverride = useMemo(
    () =>
      thinkingPanelModelId && thinkingPanelInstanceId
        ? getInstanceModelThinkingOverride(
            preferences,
            thinkingPanelInstanceId,
            thinkingPanelModel?.modelId ?? thinkingPanelModelId,
          )
        : undefined,
    [
      preferences,
      thinkingPanelInstanceId,
      thinkingPanelModelId,
      thinkingPanelModel,
    ],
  );

  const updateThinkingPanelOffset = useCallback(() => {
    if (
      !thinkingPanelModelId ||
      !thinkingPanelRef.current ||
      !listContainerRef.current
    ) {
      return;
    }

    const panel = thinkingPanelRef.current;
    const panelHeight = panel.offsetHeight;
    const panelWidth = panel.offsetWidth;
    const container = listContainerRef.current;
    const containerHeight = container.offsetHeight;
    const anchorRect = thinkingPanelAnchorRef.current?.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const panelGap = 4;

    if (anchorRect) {
      const rightSpace = window.innerWidth - anchorRect.right;
      const leftSpace = anchorRect.left;
      const side =
        rightSpace >= panelWidth + panelGap || rightSpace >= leftSpace
          ? 'right'
          : 'left';
      const rawLeft =
        side === 'right'
          ? anchorRect.right - containerRect.left + panelGap
          : anchorRect.left - containerRect.left - panelWidth - panelGap;
      const minLeft = panelGap - containerRect.left;
      const maxLeft =
        window.innerWidth - containerRect.left - panelWidth - panelGap;

      setThinkingPanelSide(side);
      setThinkingPanelLeft(Math.min(Math.max(rawLeft, minLeft), maxLeft));
    }
    const centerY = anchorRect
      ? anchorRect.top + anchorRect.height / 2 - containerRect.top
      : thinkingPanelCenterY;
    let offset = centerY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, Math.max(0, containerHeight - panelHeight));
    setThinkingPanelOffset(offset);
  }, [thinkingPanelCenterY, thinkingPanelModelId]);

  useLayoutEffect(() => {
    updateThinkingPanelOffset();
  }, [updateThinkingPanelOffset]);

  useEffect(() => {
    if (
      !thinkingPanelModelId ||
      !thinkingPanelRef.current ||
      !listContainerRef.current
    ) {
      return;
    }

    const observer = new ResizeObserver(() => updateThinkingPanelOffset());
    observer.observe(thinkingPanelRef.current);
    observer.observe(listContainerRef.current);
    listScrollViewport?.addEventListener('scroll', updateThinkingPanelOffset);
    window.addEventListener('resize', updateThinkingPanelOffset);
    updateThinkingPanelOffset();

    return () => {
      observer.disconnect();
      listScrollViewport?.removeEventListener(
        'scroll',
        updateThinkingPanelOffset,
      );
      window.removeEventListener('resize', updateThinkingPanelOffset);
    };
  }, [listScrollViewport, thinkingPanelModelId, updateThinkingPanelOffset]);

  // Close thinking panel if the model is no longer in filtered results
  useEffect(() => {
    if (!thinkingPanelModelId) return;
    const stillVisible = filteredGroups.some((g) =>
      g.entries.some((e) => e.modelId === thinkingPanelModelId),
    );
    if (!stillVisible) {
      setThinkingPanelModelId(null);
      setThinkingPanelInstanceId(null);
    }
  }, [filteredGroups, thinkingPanelModelId]);

  // Close thinking panel on outside click
  useEffect(() => {
    if (!thinkingPanelModelId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (thinkingPanelRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('[data-thinking-edit-trigger]')
      ) {
        return;
      }
      setThinkingPanelModelId(null);
      setThinkingPanelInstanceId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [thinkingPanelModelId]);

  // --- Handlers ---

  const handleAdd = useCallback(() => {
    setEditingModel(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((m: CustomModel) => {
    setEditingModel(m);
    setDialogOpen(true);
  }, []);

  const handleEditThinking = useCallback(
    (
      instanceId: string,
      modelId: string,
      event: React.MouseEvent<HTMLElement>,
    ) => {
      event.stopPropagation();
      event.preventDefault();

      const container = listContainerRef.current;
      const target = event.currentTarget;
      const anchor = target.closest<HTMLElement>('[data-model-card]') ?? target;
      thinkingPanelAnchorRef.current = target;

      if (container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = anchor.getBoundingClientRect();
        setThinkingPanelCenterY(
          itemRect.top + itemRect.height / 2 - containerRect.top,
        );
      }

      setThinkingPanelModelId((current) => {
        if (current === modelId && thinkingPanelInstanceId === instanceId) {
          thinkingPanelAnchorRef.current = null;
          setThinkingPanelInstanceId(null);
          return null;
        }
        setThinkingPanelInstanceId(instanceId);
        return modelId;
      });
    },
    [thinkingPanelInstanceId],
  );

  const handleToggleModel = useCallback(
    async (instanceId: string, modelId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const inst = draft.providerInstances.find((i) => i.id === instanceId);
        if (!inst) return;
        const idx = inst.disabledModelIds.indexOf(modelId);
        if (idx === -1) {
          inst.disabledModelIds.push(modelId);
        } else {
          inst.disabledModelIds.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const handleSetAllModelsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!filterInstanceId) return;
      const disabledModelIds = enabled
        ? []
        : Array.from(new Set(instanceEntries.map((entry) => entry.modelId)));
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const instance = draft.providerInstances.find(
          (item) => item.id === filterInstanceId,
        );
        if (instance) instance.disabledModelIds = disabledModelIds;
      });
      await updatePreferences(patches);
    },
    [filterInstanceId, instanceEntries, preferences, updatePreferences],
  );

  const resolveThinkingModel = useCallback(
    (instanceId: string, modelId: string): ThinkingPanelModel | undefined => {
      const catalogModel = getAvailableModel(modelId);
      if (catalogModel) return catalogModel;
      // Discovered model — construct a ThinkingPanelModel
      const instance = providerInstances.find((i) => i.id === instanceId);
      if (!instance) return undefined;
      const entries = getSelectableModelEntries(preferences, {
        includeDisabled: true,
      });
      const entry = entries.find(
        (e) => e.instanceId === instanceId && e.modelId === modelId,
      );
      if (!entry?.thinkingEnabled) return undefined;
      return {
        modelId: entry.targetModelId,
        modelDisplayName: entry.displayName,
        providerOptions: {},
        officialProvider:
          getInstanceThinkingDefaultOptions(instance).modelProvider ??
          getVendorForInstance(instance),
        thinkingEnabled: true,
      };
    },
    [providerInstances, preferences],
  );

  const handleSetThinkingEnabled = useCallback(
    async (instanceId: string, modelId: string, enabled: boolean) => {
      const model = resolveThinkingModel(instanceId, modelId);
      if (!model) return;
      const targetModelId = model.modelId;

      const instance = providerInstances.find((i) => i.id === instanceId);
      if (!instance) return;
      const { modelProvider, ...route } =
        getInstanceThinkingDefaultOptions(instance);
      model.officialProvider ??= modelProvider;

      const currentOverride = getInstanceModelThinkingOverride(
        preferences,
        instanceId,
        targetModelId,
      );
      const option = enabled
        ? getEnabledModelThinkingOption(model, currentOverride?.value, route)
        : (getModelThinkingOptions(model, route).find(
            (item) => item.value === currentOverride?.value,
          ) ?? getModelThinkingOptions(model, route)[0]);
      if (!option) return;

      const [, patches] = produceWithPatches(preferences, (draft) => {
        if (!draft.agent.modelThinkingOverrides[instanceId]) {
          draft.agent.modelThinkingOverrides[instanceId] = {};
        }
        draft.agent.modelThinkingOverrides[instanceId][targetModelId] = {
          ...draft.agent.modelThinkingOverrides[instanceId][targetModelId],
          enabled,
          provider: option.provider,
          value: option.value,
        };
      });
      await updatePreferences(patches);
    },
    [preferences, providerInstances, updatePreferences, resolveThinkingModel],
  );

  const handleSetThinkingValue = useCallback(
    async (instanceId: string, modelId: string, value: string) => {
      const model = resolveThinkingModel(instanceId, modelId);
      if (!model) return;
      const targetModelId = model.modelId;

      const instance = providerInstances.find((i) => i.id === instanceId);
      if (!instance) return;
      const { modelProvider, ...route } =
        getInstanceThinkingDefaultOptions(instance);
      model.officialProvider ??= modelProvider;

      const option = getModelThinkingOptions(model, route).find(
        (item) => item.value === value,
      );
      if (!option) return;

      const [, patches] = produceWithPatches(preferences, (draft) => {
        if (!draft.agent.modelThinkingOverrides[instanceId]) {
          draft.agent.modelThinkingOverrides[instanceId] = {};
        }
        draft.agent.modelThinkingOverrides[instanceId][targetModelId] = {
          enabled: true,
          provider: option.provider,
          value: option.value,
        };
      });
      await updatePreferences(patches);
    },
    [preferences, providerInstances, updatePreferences, resolveThinkingModel],
  );

  const handleResetThinkingOverride = useCallback(
    async (instanceId: string, modelId: string) => {
      const targetModelId =
        resolveThinkingModel(instanceId, modelId)?.modelId ??
        getAvailableModel(modelId)?.modelId ??
        modelId;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        delete draft.agent.modelThinkingOverrides[instanceId]?.[targetModelId];
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences, resolveThinkingModel],
  );

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

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Filter models..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          size="sm"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
        {isTrulyCustom && (
          <Button variant="secondary" size="sm" onClick={handleAdd}>
            <IconPlusOutline18 className="size-3.5" />
            Add Model
          </Button>
        )}
        {filterInstance && (
          <Menu>
            <MenuTrigger>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Model actions"
              >
                <IconDotsOutline18 className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent side="bottom" align="end" size="sm">
              {!isTrulyCustom && (
                <>
                  <MenuItem
                    disabled={isReloading}
                    className="data-disabled:opacity-50"
                    onClick={() => void handleReloadModels()}
                  >
                    <IconRefreshAnticlockwiseOutline18
                      className={cn(
                        'size-3.5 shrink-0',
                        isReloading && 'animate-spin',
                      )}
                    />
                    {isReloading ? 'Reloading models...' : 'Reload models'}
                  </MenuItem>
                  <MenuSeparator />
                </>
              )}
              <MenuItem
                disabled={!hasInstanceModels || allInstanceModelsEnabled}
                className="data-disabled:opacity-50"
                onClick={() => void handleSetAllModelsEnabled(true)}
              >
                <IconCheck2Outline18 className="size-3.5 shrink-0" />
                Enable all models
              </MenuItem>
              <MenuItem
                disabled={!hasInstanceModels || allInstanceModelsDisabled}
                className="data-disabled:opacity-50"
                onClick={() => void handleSetAllModelsEnabled(false)}
              >
                <IconBanOutline18 className="size-3.5 shrink-0" />
                Disable all models
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>

      {reloadError && <TruncatedErrorText text={reloadError} />}

      <div ref={listContainerRef} className="relative">
        <OverlayScrollbar
          className="max-h-[40vh] w-full min-[1800px]:max-h-[55vh]"
          viewportClassName="scroll-fade-y scroll-fade-6"
          onViewportRef={setListScrollViewport}
          contentClassName="space-y-3"
        >
          {filterInstance && filteredGroups.length > 0
            ? (() => {
                const filteredGroup = filteredGroups[0];
                if (!filteredGroup) return null;
                const hasSearch = searchQuery.trim().length > 0;
                const vendorGroups = groupEntriesByVendor(
                  filteredGroup.entries,
                  filterInstance,
                );

                // Search results are intentionally flat. Outside of search,
                // multi-vendor providers retain their catalog grouping and
                // every model keeps its original position when toggled.
                if (!hasSearch && vendorGroups) {
                  return (
                    <div className="space-y-2">
                      {vendorGroups.map((group) => (
                        <VendorModelGroup
                          key={group.prefix || 'other'}
                          instance={filteredGroup.instance}
                          group={group}
                          preferences={preferences}
                          onToggleModel={handleToggleModel}
                          onEditThinking={handleEditThinking}
                          onEditCustomModel={handleEdit}
                          onDeleteCustomModel={handleDelete}
                          defaultExpanded={false}
                        />
                      ))}
                    </div>
                  );
                }

                return (
                  <ModelCardList
                    instance={filteredGroup.instance}
                    entries={filteredGroup.entries}
                    preferences={preferences}
                    onToggleModel={handleToggleModel}
                    onEditThinking={handleEditThinking}
                    onEditCustomModel={handleEdit}
                    onDeleteCustomModel={handleDelete}
                  />
                );
              })()
            : filteredGroups.map(({ instance, entries }) => (
                <InstanceModelGroup
                  key={instance.id}
                  instance={instance}
                  entries={entries}
                  preferences={preferences}
                  onToggleModel={handleToggleModel}
                  onEditThinking={handleEditThinking}
                  onEditCustomModel={handleEdit}
                  onDeleteCustomModel={handleDelete}
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

        {thinkingPanelModel && thinkingPanelInstance && (
          <div
            ref={thinkingPanelRef}
            className={cn(
              'absolute z-10 flex w-64 flex-col rounded-lg border border-derived bg-background text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
              thinkingPanelSide === 'right'
                ? 'fade-in-0 slide-in-from-left-1 animate-in duration-150'
                : 'fade-in-0 slide-in-from-right-1 animate-in duration-150',
            )}
            style={{ top: thinkingPanelOffset, left: thinkingPanelLeft }}
          >
            <ModelThinkingPanel
              model={thinkingPanelModel}
              override={thinkingPanelOverride}
              defaultOptions={thinkingPanelDefaultOptions}
              onEnabledChange={(enabled) =>
                thinkingPanelInstanceId &&
                handleSetThinkingEnabled(
                  thinkingPanelInstanceId,
                  thinkingPanelModel.modelId,
                  enabled,
                )
              }
              onValueChange={(value) =>
                thinkingPanelInstanceId &&
                handleSetThinkingValue(
                  thinkingPanelInstanceId,
                  thinkingPanelModel.modelId,
                  value,
                )
              }
              onReset={() =>
                thinkingPanelInstanceId &&
                handleResetThinkingOverride(
                  thinkingPanelInstanceId,
                  thinkingPanelModel.modelId,
                )
              }
            />
          </div>
        )}
      </div>

      <CustomModelDialog
        model={editingModel}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        existingModelIds={existingModelIds}
        providerInstances={providerInstances}
      />
    </div>
  );
}

// =============================================================================
// Provider Name Editor
// =============================================================================

function ProviderNameEditor({
  instance,
  autoStart,
  onAutoStart,
  onEditingChange,
  editable,
}: {
  instance: ProviderInstance;
  autoStart: boolean;
  onAutoStart: () => void;
  onEditingChange: (isEditing: boolean) => void;
  editable: boolean;
}) {
  const updateProviderInstance = useKartonProcedure(
    (p) => p.preferences.updateProviderInstance,
  );
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(instance.name);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const committedRef = useRef(false);
  const displayName = pendingName ?? instance.name;

  const finishEditing = useCallback(() => {
    setIsEditing(false);
    onEditingChange(false);
  }, [onEditingChange]);

  const startEditing = useCallback(() => {
    if (!editable) return;
    committedRef.current = false;
    setDraftName(instance.name);
    setIsEditing(true);
    onEditingChange(true);
  }, [editable, instance.name, onEditingChange]);

  useEffect(() => {
    if (!autoStart || !editable) return;
    onAutoStart();
    startEditing();
  }, [autoStart, editable, onAutoStart, startEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const raf = requestAnimationFrame(() => {
      titleRef.current?.focus();
      const selection = window.getSelection();
      if (!selection || !titleRef.current) return;
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditing]);

  useEffect(() => {
    if (pendingName !== null && instance.name === pendingName) {
      setPendingName(null);
    }
  }, [instance.name, pendingName]);

  useEffect(() => {
    if (pendingName === null) return;
    const timeout = setTimeout(() => setPendingName(null), 3000);
    return () => clearTimeout(timeout);
  }, [pendingName]);

  const commitEdit = useCallback(() => {
    if (committedRef.current) return;
    const nextName = titleRef.current?.textContent?.trim() ?? draftName.trim();
    finishEditing();

    if (
      nextName.length < 2 ||
      nextName.length > 80 ||
      nextName === instance.name
    ) {
      setDraftName(instance.name);
      return;
    }

    committedRef.current = true;
    setPendingName(nextName);
    void updateProviderInstance(instance.id, {}, nextName);
  }, [
    draftName,
    finishEditing,
    instance.id,
    instance.name,
    updateProviderInstance,
  ]);

  const cancelEdit = useCallback(() => {
    // Escape causes the input to blur as it unmounts; block that blur from
    // committing the discarded draft.
    committedRef.current = true;
    setDraftName(instance.name);
    finishEditing();
  }, [finishEditing, instance.name]);

  if (!editable) {
    return (
      <h1 className="truncate font-semibold text-foreground text-xl">
        {displayName}
      </h1>
    );
  }

  return isEditing ? (
    <span
      ref={titleRef}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      className="block min-w-0 max-w-md cursor-text truncate font-semibold text-foreground text-xl outline-none"
      aria-label="Provider name"
      onBlur={commitEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }}
    >
      {draftName}
    </span>
  ) : (
    <div className="group flex min-w-0 items-center gap-2">
      <h1 className="min-w-0">
        <button
          type="button"
          className="cursor-pointer truncate font-semibold text-foreground text-xl outline-none"
          onClick={startEditing}
        >
          {displayName}
        </button>
      </h1>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-1 size-6 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={startEditing}
        aria-label={`Rename ${displayName}`}
      >
        <IconPenOutline18 className="size-4" />
      </Button>
    </div>
  );
}

// =============================================================================
// Self-Hosted Connection (detail page)
// =============================================================================

function SelfHostedConnection({ instance }: { instance: ProviderInstance }) {
  const preferences = useKartonState((s) => s.preferences);
  const updateProviderInstance = useKartonProcedure(
    (p) => p.preferences.updateProviderInstance,
  );
  const refreshInstanceModels = useKartonProcedure(
    (p) => p.preferences.refreshInstanceModels,
  );
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const displayInfo = getTypeDisplayInfo(instance.typeId);
  const config = instance.config as { baseUrl?: string };
  const savedBaseUrl = config.baseUrl ?? displayInfo?.defaultBaseUrl ?? '';
  const [baseUrl, setBaseUrl] = useState(savedBaseUrl);
  const isDirty = baseUrl.trim() !== savedBaseUrl.trim();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    if (!baseUrl.trim()) return;
    setIsRefreshing(true);
    setError(null);
    try {
      await updateProviderInstance(instance.id, { baseUrl: baseUrl.trim() });
      const discovered = await refreshInstanceModels(instance.id);

      // Prune stale disabledModelIds: keep only IDs still in discovered list
      const newIds = new Set(discovered.map((m) => m.modelId));
      const currentDisabled = instance.disabledModelIds ?? [];
      const pruned = currentDisabled.filter((id) => newIds.has(id));

      if (pruned.length < currentDisabled.length) {
        const [, patches] = produceWithPatches(preferences, (draft) => {
          const inst = draft.providerInstances.find(
            (i) => i.id === instance.id,
          );
          if (inst) {
            inst.disabledModelIds = pruned;
          }
        });
        await updatePreferences(patches);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh models.');
    } finally {
      setIsRefreshing(false);
    }
  }, [
    baseUrl,
    instance.id,
    instance.disabledModelIds,
    preferences,
    updateProviderInstance,
    refreshInstanceModels,
    updatePreferences,
  ]);

  return (
    <div className="space-y-3 rounded-lg border border-derived p-3">
      <div className="flex gap-2">
        <Input
          value={baseUrl}
          onValueChange={(v) => {
            setBaseUrl(v);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isDirty && baseUrl.trim()) {
              void handleRefresh();
            }
          }}
          placeholder={displayInfo?.defaultBaseUrl ?? 'Enter base URL...'}
          disabled={isRefreshing}
          size="sm"
          style={{ maxWidth: 'none' }}
          className="flex-1"
        />
        {isDirty && (
          <Button
            variant="primary"
            size="sm"
            disabled={!baseUrl.trim() || isRefreshing}
            onClick={() => void handleRefresh()}
          >
            {isRefreshing ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Edit the base URL and click Save to re-discover available models.
      </p>
      {error && <TruncatedErrorText text={error} />}
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export function ModelsProvidersSection() {
  const preferences = useKartonState((s) => s.preferences);
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null);
  const [detailRenameRequested, setDetailRenameRequested] = useState(false);
  const [isDetailNameEditing, setIsDetailNameEditing] = useState(false);
  const removeProviderInstance = useKartonProcedure(
    (p) => p.preferences.removeProviderInstance,
  );

  const detailInstance = detailInstanceId
    ? (preferences?.providerInstances ?? []).find(
        (i) => i.id === detailInstanceId,
      )
    : undefined;
  const detailModelCounts = useMemo(() => {
    if (!detailInstance) return { enabled: 0, total: 0 };
    const entries = getSelectableModelEntries(preferences, {
      includeDisabled: true,
    }).filter((entry) => entry.instanceId === detailInstance.id);
    const disabledSet = new Set(
      getInstanceDisabledModelIds(preferences, detailInstance.id),
    );
    return {
      enabled: entries.reduce(
        (count, entry) => count + Number(!disabledSet.has(entry.modelId)),
        0,
      ),
      total: entries.length,
    };
  }, [detailInstance, preferences]);

  // Intercept Escape on the capture phase when a detail page is open.
  // This fires before the global bubble-phase handler in
  // global-hotkey-bindings, so pressing Esc goes back to the list first.
  // The second Esc (on the list view) hits the global handler and exits settings.
  useEffect(() => {
    if (!detailInstanceId) return;
    const handleDetailEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isDetailNameEditing) return;
      event.preventDefault();
      event.stopPropagation();
      setDetailInstanceId(null);
    };
    window.addEventListener('keydown', handleDetailEscape, true);
    return () =>
      window.removeEventListener('keydown', handleDetailEscape, true);
  }, [detailInstanceId, isDetailNameEditing]);

  const handleDeleteInstance = useCallback(
    async (instanceId: string) => {
      await removeProviderInstance(instanceId);
      setDetailInstanceId(null);
      setDetailRenameRequested(false);
    },
    [removeProviderInstance],
  );

  // Detail view for a single provider
  if (detailInstance) {
    const displayInfo = getTypeDisplayInfo(detailInstance.typeId);
    const credentialType = displayInfo?.credentialType ?? 'none';
    const modelCount = detailModelCounts.total;
    const canDelete = detailInstance.id !== DEFAULT_INSTANCE_ID;
    const canRename = detailInstance.typeId !== 'stagewise';

    return (
      <div className="h-full w-full">
        <OverlayScrollbar
          className="h-full"
          contentClassName="px-6 pt-24 pb-24"
        >
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setDetailInstanceId(null);
                  setDetailRenameRequested(false);
                }}
              >
                <IconChevronLeftOutline18 className="size-4" />
              </Button>
              <ProviderNameEditor
                instance={detailInstance}
                autoStart={detailRenameRequested}
                onAutoStart={() => setDetailRenameRequested(false)}
                onEditingChange={setIsDetailNameEditing}
                editable={canRename}
              />
            </div>

            {/* Provider info */}
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-1">
                <InstanceLogo
                  typeId={detailInstance.typeId}
                  instance={detailInstance}
                  className="size-6 text-foreground"
                />
              </div>
              <div className="min-w-0 flex-1">
                {displayInfo?.description && (
                  <p className="text-foreground text-sm">
                    {displayInfo.description}
                  </p>
                )}
                {modelCount > 0 && (
                  <p className="mt-1.5 text-muted-foreground text-xs">
                    {modelCount} {modelCount === 1 ? 'model' : 'models'}
                  </p>
                )}
              </div>
              {canDelete && (
                <Menu>
                  <MenuTrigger>
                    <Button variant="ghost" size="icon-sm">
                      <IconDotsOutline18 className="size-4 text-muted-foreground" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent
                    side="bottom"
                    align="end"
                    sideOffset={2}
                    size="xs"
                  >
                    <MenuItem
                      size="xs"
                      onClick={() =>
                        void handleDeleteInstance(detailInstance.id)
                      }
                    >
                      <IconTrashOutline18 className="size-3.5" />
                      Delete provider
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </div>

            {/* Connection Section */}
            <section className="space-y-6">
              <div>
                <h2 className="font-medium text-foreground text-lg">
                  Connection
                </h2>
              </div>

              {credentialType === 'api-key' && (
                <div className="rounded-lg border border-derived p-3">
                  <VendorApiKeyInput instance={detailInstance} />
                </div>
              )}

              {credentialType === 'base-url' && (
                <SelfHostedConnection instance={detailInstance} />
              )}

              {credentialType === 'custom-endpoint' && (
                <CustomEndpointConnection instance={detailInstance} />
              )}

              {detailInstance.typeId === 'stagewise' && (
                <div className="rounded-lg border border-derived p-3">
                  <p className="text-muted-foreground text-xs">
                    Uses your stagewise account. All built-in models are
                    available through Stagewise Inference by default.
                  </p>
                </div>
              )}
            </section>

            {/* Models Section */}
            <section className="flex flex-col space-y-6">
              <div className="flex items-baseline gap-2">
                <h2 className="font-medium text-foreground text-lg">Models</h2>
                <span className="text-muted-foreground text-xs">
                  {detailModelCounts.enabled} of {detailModelCounts.total}{' '}
                  enabled
                </span>
              </div>

              <ModelsSection
                filterInstanceId={detailInstanceId ?? undefined}
                filterInstance={detailInstance}
              />
            </section>
          </div>
        </OverlayScrollbar>
      </div>
    );
  }

  // Main provider list view
  return (
    <div className="h-full w-full">
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="font-semibold text-foreground text-xl">
              Models & Providers
            </h1>
          </div>

          {/* Provider Instances Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">Providers</h2>
              <p className="text-muted-foreground text-sm">
                Configure how the agent connects to LLM providers. Add API keys,
                connect coding plans, or set up custom endpoints.
              </p>
            </div>

            <ProviderInstancesSection
              onConfigure={setDetailInstanceId}
              onRename={(id) => {
                setDetailInstanceId(id);
                setDetailRenameRequested(true);
              }}
              onDelete={(id) => void handleDeleteInstance(id)}
            />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}

// =============================================================================
// Shared Utilities
// =============================================================================

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
