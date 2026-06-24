import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Select } from '@stagewise/stage-ui/components/select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useState, useCallback, useMemo } from 'react';
import { produceWithPatches, enablePatches } from 'immer';
import { cn } from '@ui/utils';
import { IconPlusOutline18, IconTrashOutline18 } from 'nucleo-ui-outline-18';
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

  const canProceed = endpoints.length > 0;

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden px-8 py-8">
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <h1 className="font-medium text-foreground text-xl">
            Custom Endpoints
          </h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Add custom API endpoints for self-hosted or third-party LLM
            services.
          </p>
        </div>

        <OverlayScrollbar
          className="w-full max-w-lg flex-1"
          contentClassName="flex flex-col gap-3 pb-4"
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

  const specLabel = useMemo(
    () =>
      API_SPEC_OPTIONS.find((o) => o.value === endpoint.apiSpec)?.label ??
      endpoint.apiSpec,
    [endpoint.apiSpec],
  );

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-derived bg-surface-1 p-4">
      {/* Header row: name + delete */}
      <div className="flex items-center justify-between gap-2">
        <Input
          value={endpoint.name}
          onValueChange={(v) => onUpdate({ name: v })}
          size="sm"
          placeholder="Endpoint name"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5" />
        </Button>
      </div>

      {/* API spec + base URL */}
      <div className="flex gap-2">
        <div className="w-48 shrink-0">
          <Select
            value={endpoint.apiSpec}
            onValueChange={(val) => onUpdate({ apiSpec: val as ApiSpec })}
            items={API_SPEC_OPTIONS}
            size="md"
            triggerClassName="w-full"
          />
        </div>
        <Input
          value={endpoint.baseUrl}
          onValueChange={(v) => onUpdate({ baseUrl: v })}
          size="sm"
          placeholder="https://api.example.com/v1"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
      </div>

      {/* API key */}
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
          size="sm"
          placeholder="API key (optional)"
          className="flex-1"
          style={{ maxWidth: 'none' }}
          disabled={hasApiKey}
          readOnly={hasApiKey}
        />
        {hasApiKey ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowApiKey((v) => !v);
            }}
          >
            {showApiKey ? 'Hide' : 'Show'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (apiKeyInput.trim()) {
                onSetApiKey(apiKeyInput.trim());
                setApiKeyInput('');
              }
            }}
            disabled={!apiKeyInput.trim()}
          >
            Save Key
          </Button>
        )}
      </div>

      {/* Summary */}
      <p className={cn('truncate text-muted-foreground text-xs')}>
        {specLabel} \u00b7 {endpoint.baseUrl || 'No URL set'}
        {hasApiKey && ' \u00b7 key set'}
      </p>
    </div>
  );
}
