import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { Logo } from '@stagewise/stage-ui/components/logo';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { cn } from '@ui/utils';
import {
  IconChevronRightOutline18,
  IconChevronLeftOutline18,
  IconCheck2Outline18,
  IconArrowUpRightOutline18,
} from '@stagewise/icons';
import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';
import {
  findCodingPlanInstance,
  getTypeDisplayInfo,
} from '@shared/provider-instance-helpers';
import { CODING_PLANS, type CodingPlanId } from '@shared/coding-plans';
import { ProviderLogo } from '@ui/components/provider-logos';
import { OllamaLogo } from '@ui/components/provider-logos/ollama';
import { OpenRouterLogo } from '@ui/components/provider-logos/openrouter';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

const consoleUrl =
  import.meta.env.VITE_STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

// ─── Unified Provider Entries ──────────────────────────────────────────────

type ProviderEntry = {
  key: string;
  kind: 'vendor-api' | 'coding-plan' | 'self-hosted';
  typeId: ProviderInstanceTypeId;
  displayName: string;
  tagline: string;
  getApiKeyUrl?: string;
  helpText?: string;
  planId?: CodingPlanId;
  /** Optional disclaimer rendered below the help text (e.g. unofficial status). */
  disclaimer?: string;
  /** Extra endpoint routing info shown below the help text. */
  endpointHelpText?: string;
  defaultBaseUrl?: string;
};

/** All vendor API types shown in the unified provider list. */
const VENDOR_API_TYPES: ProviderInstanceTypeId[] = [
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
  'openrouter',
];

const SELF_HOSTED_TYPES: ProviderInstanceTypeId[] = ['ollama'];

function buildUnifiedEntries(): ProviderEntry[] {
  const entries: ProviderEntry[] = [];

  for (const typeId of VENDOR_API_TYPES) {
    const info = getTypeDisplayInfo(typeId);
    entries.push({
      key: typeId,
      kind: 'vendor-api',
      typeId,
      displayName: info.displayName,
      tagline: info.helpText ?? '',
      getApiKeyUrl: info.getApiKeyUrl,
      helpText: info.helpText,
    });
  }

  for (const plan of Object.values(CODING_PLANS)) {
    entries.push({
      key: `plan:${plan.id}`,
      kind: 'coding-plan',
      typeId: `${plan.provider}-api` as ProviderInstanceTypeId,
      displayName: plan.displayName,
      tagline: plan.tagline,
      getApiKeyUrl: plan.apiKeyUrl,
      helpText: plan.helpText,
      planId: plan.id,
      disclaimer: plan.disclaimer,
      endpointHelpText: plan.endpointHelpText,
    });
  }

  for (const typeId of SELF_HOSTED_TYPES) {
    const info = getTypeDisplayInfo(typeId);
    entries.push({
      key: typeId,
      kind: 'self-hosted',
      typeId,
      displayName: info.displayName,
      tagline: info.description,
      defaultBaseUrl: info.defaultBaseUrl,
    });
  }

  return entries;
}

const UNIFIED_ENTRIES = buildUnifiedEntries();
const VENDOR_ENTRIES = UNIFIED_ENTRIES.filter((e) => e.kind === 'vendor-api');
const CODING_PLAN_ENTRIES = UNIFIED_ENTRIES.filter(
  (e) => e.kind === 'coding-plan',
);
const SELF_HOSTED_ENTRIES = UNIFIED_ENTRIES.filter(
  (e) => e.kind === 'self-hosted',
);

// ─── Truncated Error Text ──────────────────────────────────────────────────

function TruncatedErrorText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    if (ref.current) {
      setIsTruncated(ref.current.scrollWidth > ref.current.clientWidth);
    }
  }, []);

  useState(() => {
    checkTruncation();
  });

  return (
    <Tooltip open={isTruncated && tooltipOpen}>
      <TooltipTrigger>
        <p
          ref={ref}
          className="truncate text-error-foreground text-xs"
          onMouseEnter={() => {
            checkTruncation();
            setTooltipOpen(true);
          }}
          onMouseLeave={() => setTooltipOpen(false)}
        >
          {text}
        </p>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

// ─── Stagewise Status Card ─────────────────────────────────────────────────

function StagewiseStatusCard({
  connected,
  onBack,
}: {
  connected: boolean;
  onBack: () => void;
}) {
  const subscription = useKartonState((s) => s.userAccount.subscription);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const refreshSubscription = useKartonProcedure(
    (p) => p.userAccount.refreshSubscription,
  );
  const plan = subscription?.plan;
  const isFreePlan = !plan || plan === 'free';

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      void refreshSubscription();
    }, 10_000);
    return () => clearInterval(id);
  }, [connected, refreshSubscription]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-derived bg-surface-1 p-3">
      <Logo className="size-5 shrink-0" pathClassName="text-foreground" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-foreground text-sm">
          Stagewise Inference
        </h3>
        <p className="truncate text-muted-foreground text-xs">
          {!connected
            ? 'Sign in to access models via stagewise'
            : isFreePlan
              ? 'Requires Pro or Ultra plan'
              : 'Connected — all built-in models available'}
        </p>
      </div>
      {!connected ? (
        <Button variant="ghost" size="xs" onClick={onBack}>
          <IconChevronLeftOutline18 className="size-3.5" />
          Sign in
        </Button>
      ) : isFreePlan ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void openExternalUrl(consoleUrl)}
        >
          Upgrade to Pro
          <IconArrowUpRightOutline18 className="size-3" />
        </Button>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-success-foreground text-xs">
          <IconCheck2Outline18 className="size-4" />
          Connected
        </span>
      )}
    </div>
  );
}

// ─── Provider Logo for Detail View ──────────────────────────────────────────

function EntryLogo({
  entry,
  className,
}: {
  entry: ProviderEntry;
  className?: string;
}) {
  if (entry.kind === 'coding-plan' && entry.planId) {
    const plan = CODING_PLANS[entry.planId];
    return (
      <ProviderLogo
        provider={plan.provider}
        className={className ?? 'size-5'}
      />
    );
  }
  if (entry.kind === 'self-hosted' && entry.typeId === 'ollama') {
    return <OllamaLogo className={className ?? 'size-5'} />;
  }
  if (entry.typeId === 'openrouter') {
    return <OpenRouterLogo className={className ?? 'size-5'} />;
  }
  const vendor = entry.typeId.slice(0, -4) as Parameters<
    typeof ProviderLogo
  >[0]['provider'];
  return <ProviderLogo provider={vendor} className={className ?? 'size-5'} />;
}

// ─── Provider List Card ────────────────────────────────────────────────────

function ProviderListCard({
  entry,
  isConnected,
  onClick,
}: {
  entry: ProviderEntry;
  isConnected: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-derived bg-surface-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isConnected}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
          !isConnected && 'cursor-pointer hover:bg-surface-2',
          isConnected && 'cursor-default',
        )}
      >
        <EntryLogo entry={entry} className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground text-sm">
            {entry.displayName}
          </p>
          {entry.tagline && (
            <p className="truncate text-muted-foreground text-xs">
              {entry.tagline}
            </p>
          )}
        </div>
        {isConnected ? (
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-success-foreground text-xs">
            <IconCheck2Outline18 className="size-4" />
            Connected
          </span>
        ) : (
          <IconChevronRightOutline18 className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// ─── Connection Detail View ─────────────────────────────────────────────────

function ConnectionDetailView({
  entry,
  onBack,
}: {
  entry: ProviderEntry;
  onBack: () => void;
}) {
  const addProviderInstance = useKartonProcedure(
    (p) => p.preferences.addProviderInstance,
  );
  const connectCodingPlan = useKartonProcedure(
    (p) => p.preferences.connectCodingPlan,
  );
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const track = useTrack();

  const [apiKey, setApiKey] = useState(
    entry.kind === 'self-hosted' ? (entry.defaultBaseUrl ?? '') : '',
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) return;
    setIsConnecting(true);
    setError(null);
    try {
      if (entry.kind === 'vendor-api') {
        const result = await addProviderInstance({
          typeId: entry.typeId,
          config: {},
          validateApiKey: apiKey.trim(),
        });
        if (!result.success) {
          setError(result.error);
          void track('onboarding-provider-connect-failed', {
            key: entry.key,
            error_kind: 'validation-error',
          });
          return;
        }
      } else if (entry.kind === 'self-hosted') {
        const result = await addProviderInstance({
          typeId: entry.typeId,
          config: { baseUrl: apiKey.trim() },
        });
        if (!result.success) {
          setError(result.error);
          void track('onboarding-provider-connect-failed', {
            key: entry.key,
            error_kind: 'validation-error',
          });
          return;
        }
      } else if (entry.planId) {
        const result = await connectCodingPlan(entry.planId, apiKey.trim());
        if (!result.success) {
          setError(result.error);
          void track('onboarding-provider-connect-failed', {
            key: entry.key,
            error_kind: 'validation-error',
          });
          return;
        }
      }
      void track('onboarding-provider-connected', { key: entry.key });
      onBack();
    } catch {
      setError('Connection failed. Please try again.');
      void track('onboarding-provider-connect-failed', {
        key: entry.key,
        error_kind: 'network-error',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [apiKey, entry, addProviderInstance, connectCodingPlan, track, onBack]);

  return (
    <div className="space-y-4">
      <div className="space-y-3 pt-1 pb-4">
        {/* Provider header: logo + name + tagline */}
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-1">
            <EntryLogo entry={entry} className="size-5 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-foreground text-sm">
              {entry.displayName}
            </h3>
            {entry.tagline && (
              <p className="mt-0.5 text-muted-foreground text-xs">
                {entry.tagline}
              </p>
            )}
          </div>
        </div>

        <Input
          autoFocus
          type={entry.kind === 'self-hosted' ? 'text' : 'password'}
          placeholder={
            entry.kind === 'self-hosted'
              ? 'Enter base URL...'
              : 'Enter API key...'
          }
          value={apiKey}
          onValueChange={(v) => {
            setApiKey(v);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apiKey.trim()) {
              void handleConnect();
            }
          }}
          disabled={isConnecting}
          aria-invalid={error ? true : undefined}
          size="sm"
          style={{ maxWidth: 'none' }}
          className={cn(error && 'border-error-foreground')}
        />

        {error && <TruncatedErrorText text={error} />}

        {!error && entry.kind === 'self-hosted' && (
          <p className="text-subtle-foreground text-xs">
            Enter the base URL of your {entry.displayName} instance. Default is{' '}
            {entry.defaultBaseUrl}.
          </p>
        )}

        {!error && entry.helpText && (
          <p className="text-subtle-foreground text-xs">
            <span className="inline-flex items-center gap-1">
              {entry.helpText}
              {entry.getApiKeyUrl && (
                <button
                  type="button"
                  onClick={() => void openExternalUrl(entry.getApiKeyUrl!)}
                  className={cn(
                    buttonVariants({ variant: 'link', size: 'xs' }),
                    'shrink-0',
                  )}
                >
                  Create key
                </button>
              )}
            </span>
            {entry.endpointHelpText && (
              <span className="mt-0.5 block text-2xs text-subtle-foreground">
                {entry.endpointHelpText}
              </span>
            )}
          </p>
        )}

        {entry.disclaimer && (
          <p className="text-2xs text-warning-foreground">{entry.disclaimer}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!apiKey.trim() || isConnecting}
          onClick={() => void handleConnect()}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}

// ─── Scrollable Provider List ──────────────────────────────────────────────

function ScrollableProviderList({
  isStagewiseConnected,
  searchQuery,
  isEntryConnected,
  onSelectEntry,
  onBack,
}: {
  isStagewiseConnected: boolean;
  searchQuery: string;
  isEntryConnected: (entry: ProviderEntry) => boolean;
  onSelectEntry: (entry: ProviderEntry) => void;
  onBack: () => void;
}) {
  const query = searchQuery.trim().toLowerCase();

  const filteredVendorEntries = useMemo(
    () =>
      query
        ? VENDOR_ENTRIES.filter((e) =>
            e.displayName.toLowerCase().includes(query),
          )
        : VENDOR_ENTRIES,
    [query],
  );

  const filteredSelfHostedEntries = useMemo(
    () =>
      query
        ? SELF_HOSTED_ENTRIES.filter((e) =>
            e.displayName.toLowerCase().includes(query),
          )
        : SELF_HOSTED_ENTRIES,
    [query],
  );

  const filteredCodingPlanEntries = useMemo(
    () =>
      query
        ? CODING_PLAN_ENTRIES.filter((e) =>
            e.displayName.toLowerCase().includes(query),
          )
        : CODING_PLAN_ENTRIES,
    [query],
  );

  // Split all entries into connected vs unconnected.
  // Connected entries are shown in a single section right after Builtin.
  const allFilteredEntries = useMemo(
    () => [
      ...filteredCodingPlanEntries,
      ...filteredSelfHostedEntries,
      ...filteredVendorEntries,
    ],
    [
      filteredCodingPlanEntries,
      filteredSelfHostedEntries,
      filteredVendorEntries,
    ],
  );

  const connectedEntries = useMemo(
    () => allFilteredEntries.filter((e) => isEntryConnected(e)),
    [allFilteredEntries, isEntryConnected],
  );

  const unconnectedCodingPlanEntries = useMemo(
    () => filteredCodingPlanEntries.filter((e) => !isEntryConnected(e)),
    [filteredCodingPlanEntries, isEntryConnected],
  );

  const unconnectedSelfHostedEntries = useMemo(
    () => filteredSelfHostedEntries.filter((e) => !isEntryConnected(e)),
    [filteredSelfHostedEntries, isEntryConnected],
  );

  const unconnectedVendorEntries = useMemo(
    () => filteredVendorEntries.filter((e) => !isEntryConnected(e)),
    [filteredVendorEntries, isEntryConnected],
  );

  // Scroll fade mask
  const [contentViewport, setContentViewport] = useState<HTMLElement | null>(
    null,
  );
  const contentScrollRef = useRef<HTMLElement | null>(null);
  contentScrollRef.current = contentViewport;
  const { maskStyle } = useScrollFadeMask(contentScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const noResults =
    query.length > 0 &&
    connectedEntries.length === 0 &&
    unconnectedCodingPlanEntries.length === 0 &&
    unconnectedSelfHostedEntries.length === 0 &&
    unconnectedVendorEntries.length === 0;

  return (
    <div className="min-h-0 pb-4">
      <OverlayScrollbar
        className="mask-alpha h-80 sm:h-96"
        style={maskStyle}
        onViewportRef={setContentViewport}
        contentClassName="flex flex-col gap-4"
      >
        {noResults && (
          <p className="py-4 text-center text-muted-foreground text-xs">
            No providers match &quot;{query}&quot;
          </p>
        )}

        {/* Builtin */}
        {!query && (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">Builtin</p>
            <StagewiseStatusCard
              connected={isStagewiseConnected}
              onBack={onBack}
            />
          </div>
        )}

        {/* Connected — all connected entries across categories */}
        {connectedEntries.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">Connected</p>
            <div className="flex flex-col gap-2">
              {connectedEntries.map((entry) => (
                <ProviderListCard
                  key={entry.key}
                  entry={entry}
                  isConnected={isEntryConnected(entry)}
                  onClick={() => onSelectEntry(entry)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Coding Plans */}
        {unconnectedCodingPlanEntries.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">Coding Plans</p>
            <div className="flex flex-col gap-2">
              {unconnectedCodingPlanEntries.map((entry) => (
                <ProviderListCard
                  key={entry.key}
                  entry={entry}
                  isConnected={isEntryConnected(entry)}
                  onClick={() => onSelectEntry(entry)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Self-Hosted */}
        {unconnectedSelfHostedEntries.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">Self-Hosted</p>
            <div className="flex flex-col gap-2">
              {unconnectedSelfHostedEntries.map((entry) => (
                <ProviderListCard
                  key={entry.key}
                  entry={entry}
                  isConnected={isEntryConnected(entry)}
                  onClick={() => onSelectEntry(entry)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Official API Keys */}
        {unconnectedVendorEntries.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">
              Official API Keys
            </p>
            <div className="flex flex-col gap-2">
              {unconnectedVendorEntries.map((entry) => (
                <ProviderListCard
                  key={entry.key}
                  entry={entry}
                  isConnected={isEntryConnected(entry)}
                  onClick={() => onSelectEntry(entry)}
                />
              ))}
            </div>
          </div>
        )}
      </OverlayScrollbar>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function StepConfigureProviders({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const authStatus = useKartonState((s) => s.userAccount.status);

  const [selectedEntry, setSelectedEntry] = useState<ProviderEntry | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');

  const isStagewiseConnected =
    authStatus === 'authenticated' || authStatus === 'server_unreachable';

  // Check if a provider entry is already connected.
  const isEntryConnected = useCallback(
    (entry: ProviderEntry) => {
      if (entry.kind === 'coding-plan' && entry.planId) {
        const inst = findCodingPlanInstance(preferences, entry.planId);
        return (
          !!inst &&
          !!(inst.config as { encryptedApiKey?: string }).encryptedApiKey
        );
      }
      if (entry.kind === 'self-hosted') {
        return !!preferences.providerInstances?.find(
          (i) => i.typeId === entry.typeId,
        );
      }
      const inst = preferences.providerInstances?.find(
        (i) => i.typeId === entry.typeId,
      );
      return (
        !!inst &&
        !!(inst.config as { encryptedApiKey?: string }).encryptedApiKey
      );
    },
    [preferences],
  );

  const handleBack = useCallback(() => {
    setSelectedEntry(null);
    setSearchQuery('');
  }, []);

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center justify-center overflow-hidden">
        <div className="flex w-full max-w-xl flex-col px-8">
          {/* Fixed header — stays visible while the list scrolls */}
          <div className="flex shrink-0 flex-col gap-4 pt-8 pb-4">
            <div className="flex flex-col items-center gap-1">
              <h1 className="font-medium text-foreground text-xl">
                {selectedEntry
                  ? `Connect ${selectedEntry.displayName}`
                  : 'Connect your providers'}
              </h1>
              {!selectedEntry && (
                <p className="text-center text-muted-foreground text-sm">
                  Add API keys or coding plans to use your own models. You can
                  skip this and configure later in Settings.
                </p>
              )}
            </div>

            {/* Search input — only in list mode */}
            {!selectedEntry && (
              <Input
                type="text"
                placeholder="Search providers..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="w-full"
              />
            )}
          </div>

          {selectedEntry ? (
            /* Connection detail view */
            <div className="min-h-0 pb-4">
              <ConnectionDetailView entry={selectedEntry} onBack={handleBack} />
            </div>
          ) : (
            /* Scrollable provider list with groups */
            <ScrollableProviderList
              isStagewiseConnected={isStagewiseConnected}
              searchQuery={searchQuery}
              isEntryConnected={isEntryConnected}
              onSelectEntry={setSelectedEntry}
              onBack={onBack}
            />
          )}
        </div>
      </div>
      {selectedEntry ? (
        /* Detail mode: Back only, no Next */
        <OnboardingBottomNav
          left={<BackButton onClick={handleBack} />}
          right={null}
        />
      ) : (
        <OnboardingBottomNav
          left={<BackButton onClick={onBack} />}
          right={<NextButton onClick={onNext} label="Next" />}
        />
      )}
    </>
  );
}
