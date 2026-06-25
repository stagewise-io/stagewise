import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Select } from '@stagewise/stage-ui/components/select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useCallback, useMemo, useState, useRef } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { produceWithPatches, enablePatches } from 'immer';
import { IconPlusOutline18, IconTrashOutline18 } from 'nucleo-ui-outline-18';
import { IconTriangleWarningFillDuo18 } from 'nucleo-ui-fill-duo-18';
import type { CustomModel } from '@shared/karton-contracts/ui/shared-types';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

enablePatches();

const MIN_RECOMMENDED_CONTEXT = 64000;

const SENTINEL_DISPLAY_NAME = 'New Model';
const SENTINEL_MODEL_ID_PREFIX = 'custom-model-';
const DEFAULT_CONTEXT_WINDOW = 128000;

export function StepCustomModels({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const customModels = preferences?.customModels ?? [];
  const customEndpoints = preferences?.customEndpoints ?? [];

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

  const endpointOptions = useMemo(() => {
    return customEndpoints.map((ep) => ({
      value: ep.id,
      label: ep.name,
      group: 'Custom Endpoints',
    }));
  }, [customEndpoints]);

  const handleAdd = useCallback(async () => {
    const defaultEndpointId = customEndpoints[0]?.id ?? '';
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.customModels.push({
        modelId: `${SENTINEL_MODEL_ID_PREFIX}${Date.now()}`,
        displayName: SENTINEL_DISPLAY_NAME,
        description: '',
        contextWindowSize: DEFAULT_CONTEXT_WINDOW,
        endpointId: defaultEndpointId,
        thinkingEnabled: false,
        capabilities: {
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
        },
        providerOptions: {},
        headers: {},
      });
    });
    await updatePreferences(patches);
  }, [customEndpoints, preferences, updatePreferences]);

  const handleUpdate = useCallback(
    async (modelId: string, updates: Partial<CustomModel>) => {
      const idx = customModels.findIndex((m) => m.modelId === modelId);
      if (idx === -1) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const model = draft.customModels[idx]!;
        if (updates.modelId !== undefined) model.modelId = updates.modelId;
        if (updates.displayName !== undefined)
          model.displayName = updates.displayName;
        if (updates.contextWindowSize !== undefined)
          model.contextWindowSize = updates.contextWindowSize;
        if (updates.endpointId !== undefined)
          model.endpointId = updates.endpointId;
      });
      await updatePreferences(patches);
    },
    [customModels, preferences, updatePreferences],
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

  // Strict validation: every model must have a valid name, ID, endpoint, and
  // max context length. Models with sentinel/placeholder values are invalid.
  const invalidModelCount = useMemo(() => {
    return customModels.filter((m) => {
      const hasValidName =
        m.displayName.trim().length > 0 &&
        m.displayName !== SENTINEL_DISPLAY_NAME;
      const hasValidId =
        m.modelId.trim().length > 0 &&
        !m.modelId.startsWith(SENTINEL_MODEL_ID_PREFIX);
      const hasValidEndpoint = m.endpointId.trim().length > 0;
      const hasValidContext = m.contextWindowSize > 0;
      return !(
        hasValidName &&
        hasValidId &&
        hasValidEndpoint &&
        hasValidContext
      );
    }).length;
  }, [customModels]);

  const canProceed = customModels.length === 0 || invalidModelCount === 0;

  const blockReason = canProceed
    ? null
    : `${invalidModelCount} model${invalidModelCount > 1 ? 's' : ''} need${invalidModelCount === 1 ? 's' : ''} a valid name, model ID, endpoint, and max context length`;

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden pt-8">
        <div className="flex shrink-0 flex-col items-center gap-2 px-8 text-center">
          <h1 className="font-medium text-foreground text-xl">Custom Models</h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Define models served through your custom endpoints. You can skip
            this step if you don&apos;t need custom models yet.
          </p>
        </div>

        <OverlayScrollbar
          className="mask-alpha w-full max-w-lg flex-1"
          style={contentMaskStyle}
          onViewportRef={setContentViewport}
          contentClassName="flex flex-col gap-3 px-8 pb-4 pt-4"
        >
          {customModels.length === 0 ? (
            <div className="rounded-lg border border-derived-subtle p-6">
              <p className="text-center text-muted-foreground text-sm">
                No custom models configured yet. Add one or skip to finish
                setup.
              </p>
            </div>
          ) : (
            customModels.map((model) => (
              <ModelRow
                key={model.modelId}
                model={model}
                endpointOptions={endpointOptions}
                onUpdate={(updates) =>
                  void handleUpdate(model.modelId, updates)
                }
                onDelete={() => void handleDelete(model.modelId)}
              />
            ))
          )}

          <div className="flex justify-center pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleAdd()}
              disabled={customEndpoints.length === 0}
            >
              <IconPlusOutline18 className="size-3.5" />
              Add Model
            </Button>
          </div>
          {customEndpoints.length === 0 && (
            <p className="text-center text-muted-foreground text-xs">
              Add a custom endpoint first before creating models.
            </p>
          )}
        </OverlayScrollbar>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <NextButton
            onClick={onNext}
            disabled={!canProceed}
            blockReason={blockReason}
            label={customModels.length > 0 ? 'Next' : 'Skip'}
          />
        }
      />
    </>
  );
}

function ModelRow({
  model,
  endpointOptions,
  onUpdate,
  onDelete,
}: {
  model: CustomModel;
  endpointOptions: { value: string; label: string; group: string }[];
  onUpdate: (updates: Partial<CustomModel>) => void;
  onDelete: () => void;
}) {
  const isDisplayNameSentinel = model.displayName === SENTINEL_DISPLAY_NAME;
  const isModelIdSentinel = model.modelId.startsWith(SENTINEL_MODEL_ID_PREFIX);
  const isContextSentinel = model.contextWindowSize === DEFAULT_CONTEXT_WINDOW;

  const showContextWarning =
    !isContextSentinel && model.contextWindowSize < MIN_RECOMMENDED_CONTEXT;

  const handleDisplayNameBlur = useCallback(() => {
    if (!model.displayName.trim()) {
      onUpdate({ displayName: SENTINEL_DISPLAY_NAME });
    }
  }, [model.displayName, onUpdate]);

  const handleModelIdBlur = useCallback(() => {
    if (!model.modelId.trim()) {
      onUpdate({ modelId: `${SENTINEL_MODEL_ID_PREFIX}${Date.now()}` });
    }
  }, [model.modelId, onUpdate]);

  const handleContextBlur = useCallback(() => {
    if (
      !model.contextWindowSize ||
      model.contextWindowSize <= 0 ||
      Number.isNaN(model.contextWindowSize)
    ) {
      onUpdate({ contextWindowSize: DEFAULT_CONTEXT_WINDOW });
    }
  }, [model.contextWindowSize, onUpdate]);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-derived bg-surface-1 p-4">
      {/* Header: display name + delete */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Display Name
          </span>
          <Input
            value={isDisplayNameSentinel ? '' : model.displayName}
            onValueChange={(v) =>
              onUpdate({ displayName: v || SENTINEL_DISPLAY_NAME })
            }
            onBlur={handleDisplayNameBlur}
            size="sm"
            placeholder="e.g. My Custom GPT-4o"
            className="w-full"
          />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5" />
        </Button>
      </div>

      {/* Model ID */}
      <div className="flex flex-col gap-1">
        <span className="font-medium text-muted-foreground text-xs">
          Model ID
        </span>
        <Input
          value={isModelIdSentinel ? '' : model.modelId}
          onValueChange={(v) =>
            onUpdate({
              modelId: v || `${SENTINEL_MODEL_ID_PREFIX}${Date.now()}`,
            })
          }
          onBlur={handleModelIdBlur}
          size="sm"
          placeholder="gpt-4o-mini"
          className="w-full"
        />
      </div>

      {/* Endpoint + context window */}
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Endpoint
          </span>
          <Select
            value={model.endpointId}
            onValueChange={(val) => onUpdate({ endpointId: val as string })}
            items={endpointOptions}
            size="md"
            triggerClassName="w-full"
          />
        </div>
        <div className="flex w-36 shrink-0 flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs">
            Max context length
          </span>
          <Input
            type="number"
            value={isContextSentinel ? '' : String(model.contextWindowSize)}
            onValueChange={(val) =>
              onUpdate({
                contextWindowSize:
                  Number.parseInt(val, 10) || DEFAULT_CONTEXT_WINDOW,
              })
            }
            onBlur={handleContextBlur}
            size="sm"
            placeholder="128000"
          />
        </div>
      </div>

      {/* Context window warning */}
      {showContextWarning && (
        <div className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2">
          <IconTriangleWarningFillDuo18 className="mt-0.5 size-3 shrink-0 text-warning-foreground" />
          <p className="text-warning-foreground text-xs">
            Models with a context window smaller than{' '}
            {MIN_RECOMMENDED_CONTEXT.toLocaleString()} tokens are not
            recommended for use in Stagewise.
          </p>
        </div>
      )}
    </div>
  );
}
