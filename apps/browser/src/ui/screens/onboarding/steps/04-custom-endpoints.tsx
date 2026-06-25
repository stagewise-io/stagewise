import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Select } from '@stagewise/stage-ui/components/select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { produceWithPatches, enablePatches } from 'immer';

import { IconPlusOutline18, IconTrashOutline18 } from 'nucleo-ui-outline-18';
import { IconTriangleWarningFillDuo18 } from 'nucleo-ui-fill-duo-18';
import type {
  ApiSpec,
  CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

enablePatches();

const API_SPEC_OPTIONS: { value: ApiSpec; label: string; group: string }[] = [
  {
    value: 'openai-chat-completions',
    label: 'OpenAI (Chat Completions)',
    group: 'Generic',
  },
  { value: 'openai-responses', label: 'OpenAI (Responses)', group: 'Generic' },
  { value: 'anthropic', label: 'Anthropic', group: 'Generic' },
  { value: 'google', label: 'Google', group: 'Generic' },
  { value: 'azure', label: 'Azure OpenAI', group: 'Cloud' },
  { value: 'amazon-bedrock', label: 'Amazon Bedrock', group: 'Cloud' },
  { value: 'google-vertex', label: 'Google Vertex AI', group: 'Cloud' },
];

type ReachabilityState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'reachable' }
  | { status: 'unreachable'; reason: string };

export function StepCustomEndpoints({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const setCustomEndpointApiKey = useKartonProcedure(
    (p) => p.preferences.setCustomEndpointApiKey,
  );

  const endpoints = preferences?.customEndpoints ?? [];

  // Scroll fade mask
  const [contentViewport, setContentViewport] = useState<HTMLElement | null>(
    null,
  );
  const contentScrollRef = useRef<HTMLElement | null>(null);
  contentScrollRef.current = contentViewport;
  const { maskStyle: contentMaskStyle } = useScrollFadeMask(contentScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const handleAdd = useCallback(async () => {
    const id = crypto.randomUUID();
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.customEndpoints.push({
        id,
        name: 'New Endpoint',
        apiSpec: 'openai-chat-completions',
        baseUrl: '',
        awsAuthMode: 'access-keys',
      });
    });
    await updatePreferences(patches);
  }, [preferences, updatePreferences]);

  const handleUpdate = useCallback(
    async (endpointId: string, updates: Partial<CustomEndpoint>) => {
      const idx = endpoints.findIndex((ep) => ep.id === endpointId);
      if (idx === -1) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const ep = draft.customEndpoints[idx]!;
        if (updates.name !== undefined) ep.name = updates.name;
        if (updates.apiSpec !== undefined) ep.apiSpec = updates.apiSpec;
        if (updates.baseUrl !== undefined) ep.baseUrl = updates.baseUrl;
      });
      await updatePreferences(patches);
    },
    [endpoints, preferences, updatePreferences],
  );

  const handleSetApiKey = useCallback(
    async (endpointId: string, apiKey: string) => {
      await setCustomEndpointApiKey(endpointId, apiKey);
    },
    [setCustomEndpointApiKey],
  );

  const handleDelete = useCallback(
    async (endpointId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.customEndpoints.findIndex(
          (ep) => ep.id === endpointId,
        );
        if (idx !== -1) {
          draft.customEndpoints.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const canProceed = endpoints.some(
    (ep) => ep.name.trim().length > 0 && ep.baseUrl.trim().length > 0,
  );

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden pt-8">
        <div className="flex shrink-0 flex-col items-center gap-2 px-8 text-center">
          <h1 className="font-medium text-foreground text-xl">
            Custom Endpoints
          </h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Add custom API endpoints for self-hosted or third-party LLM
            services.
          </p>
        </div>

        <OverlayScrollbar
          className="mask-alpha w-full max-w-lg flex-1"
          style={contentMaskStyle}
          onViewportRef={setContentViewport}
          contentClassName="flex flex-col gap-3 px-8 pb-4 pt-4"
        >
          {endpoints.length === 0 ? (
            <div className="rounded-lg border border-derived-subtle p-6">
              <p className="text-center text-muted-foreground text-sm">
                No custom endpoints configured yet. Add one to get started.
              </p>
            </div>
          ) : (
            endpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                endpoint={ep}
                onUpdate={(updates) => void handleUpdate(ep.id, updates)}
                onSetApiKey={(key) => void handleSetApiKey(ep.id, key)}
                onDelete={() => void handleDelete(ep.id)}
              />
            ))
          )}

          <div className="flex justify-center pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleAdd()}
            >
              <IconPlusOutline18 className="size-3.5" />
              Add Endpoint
            </Button>
          </div>
        </OverlayScrollbar>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <NextButton
            onClick={onNext}
            disabled={!canProceed}
            blockReason={
              canProceed
                ? null
                : 'Add at least one endpoint to continue, or go back to choose a different option'
            }
            label={endpoints.length > 0 ? 'Next' : 'Skip'}
          />
        }
      />
    </>
  );
}

function EndpointRow({
  endpoint,
  onUpdate,
  onSetApiKey,
  onDelete,
}: {
  endpoint: CustomEndpoint;
  onUpdate: (updates: Partial<CustomEndpoint>) => void;
  onSetApiKey: (apiKey: string) => void;
  onDelete: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const hasApiKey = !!endpoint.encryptedApiKey;

  // Reachability test state
  const [reachability, setReachability] = useState<ReachabilityState>({
    status: 'idle',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testEndpointReachability = useKartonProcedure(
    (p) => p.preferences.testEndpointReachability,
  );

  const runReachabilityTest = useCallback(
    (baseUrl: string, apiSpec: ApiSpec) => {
      if (!baseUrl.trim()) {
        setReachability({ status: 'idle' });
        return;
      }
      setReachability({ status: 'testing' });
      void testEndpointReachability(baseUrl, apiSpec).then((result) => {
        if (result.reachable) {
          setReachability({ status: 'reachable' });
        } else {
          setReachability({ status: 'unreachable', reason: result.reason });
        }
      });
    },
    [testEndpointReachability],
  );

  // Debounced re-validation after baseUrl or apiSpec changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!endpoint.baseUrl.trim()) {
      setReachability({ status: 'idle' });
      return;
    }
    debounceRef.current = setTimeout(() => {
      runReachabilityTest(endpoint.baseUrl, endpoint.apiSpec);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [endpoint.baseUrl, endpoint.apiSpec, runReachabilityTest]);

  const handleApiKeyBlur = useCallback(() => {
    if (apiKeyInput.trim() && !hasApiKey) {
      onSetApiKey(apiKeyInput.trim());
      setApiKeyInput('');
    }
  }, [apiKeyInput, hasApiKey, onSetApiKey]);

  const handleBaseUrlBlur = useCallback(() => {
    runReachabilityTest(endpoint.baseUrl, endpoint.apiSpec);
  }, [endpoint.baseUrl, endpoint.apiSpec, runReachabilityTest]);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-derived bg-surface-1 p-4">
      {/* Name + delete */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Name
          </span>
          <Input
            value={endpoint.name}
            onValueChange={(v) => onUpdate({ name: v })}
            size="sm"
            placeholder="Endpoint name"
            className="w-full"
          />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5" />
        </Button>
      </div>

      {/* API spec + base URL */}
      <div className="flex gap-2">
        <div className="flex w-48 shrink-0 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            API Spec
          </span>
          <Select
            value={endpoint.apiSpec}
            onValueChange={(val) => onUpdate({ apiSpec: val as ApiSpec })}
            items={API_SPEC_OPTIONS}
            size="md"
            triggerClassName="w-full"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Base URL
          </span>
          <Input
            value={endpoint.baseUrl}
            onValueChange={(v) => onUpdate({ baseUrl: v })}
            onBlur={handleBaseUrlBlur}
            size="sm"
            placeholder="https://api.example.com/v1"
            className="w-full"
          />
        </div>
      </div>

      {/* Reachability status */}
      {reachability.status === 'testing' && (
        <p className="text-muted-foreground text-xs">
          Testing endpoint reachability...
        </p>
      )}
      {reachability.status === 'reachable' && (
        <p className="text-success-foreground text-xs">Endpoint is reachable</p>
      )}
      {reachability.status === 'unreachable' && (
        <div className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2">
          <IconTriangleWarningFillDuo18 className="mt-0.5 size-3 shrink-0 text-warning-foreground" />
          <p className="text-warning-foreground text-xs">
            {reachability.reason} — you can still proceed, but the endpoint may
            not work correctly.
          </p>
        </div>
      )}

      {/* API key */}
      <div className="flex flex-col gap-1">
        <span className="font-medium text-muted-foreground text-xs">
          API Key
        </span>
        <div className="flex gap-1.5">
          <Input
            type={showApiKey || !hasApiKey ? 'text' : 'password'}
            value={
              hasApiKey
                ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                : apiKeyInput
            }
            onValueChange={(v) => {
              if (!hasApiKey) setApiKeyInput(v);
            }}
            onBlur={handleApiKeyBlur}
            size="sm"
            placeholder="API key (optional)"
            className="w-full"
            disabled={hasApiKey}
            readOnly={hasApiKey}
          />
          {hasApiKey && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowApiKey((v) => !v);
              }}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
