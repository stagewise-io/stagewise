import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Select } from '@stagewise/stage-ui/components/select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useCallback, useMemo } from 'react';
import { produceWithPatches, enablePatches } from 'immer';
import { IconPlusOutline18, IconTrashOutline18 } from 'nucleo-ui-outline-18';
import type { CustomModel } from '@shared/karton-contracts/ui/shared-types';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

enablePatches();

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
        modelId: `custom-model-${Date.now()}`,
        displayName: 'New Model',
        description: '',
        contextWindowSize: 128000,
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

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden px-8 py-8">
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <h1 className="font-medium text-foreground text-xl">Custom Models</h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Define models served through your custom endpoints. You can skip
            this step if you don&apos;t need custom models yet.
          </p>
        </div>

        <OverlayScrollbar
          className="w-full max-w-lg flex-1"
          contentClassName="flex flex-col gap-3 pb-4"
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
            disabled={false}
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
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-derived bg-surface-1 p-4">
      {/* Header: display name + delete */}
      <div className="flex items-center justify-between gap-2">
        <Input
          value={model.displayName}
          onValueChange={(v) => onUpdate({ displayName: v })}
          size="sm"
          placeholder="Display name"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5" />
        </Button>
      </div>

      {/* Model ID */}
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Model ID</span>
        <Input
          value={model.modelId}
          onValueChange={(v) => onUpdate({ modelId: v })}
          size="sm"
          placeholder="gpt-4o-mini"
        />
      </div>

      {/* Endpoint + context window */}
      <div className="flex gap-2">
        <div className="flex-1">
          <span className="mb-1 block text-muted-foreground text-xs">
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
        <div className="w-32 shrink-0">
          <span className="mb-1 block text-muted-foreground text-xs">
            Context
          </span>
          <Input
            type="number"
            value={String(model.contextWindowSize)}
            onValueChange={(val) =>
              onUpdate({
                contextWindowSize: Number.parseInt(val, 10) || 128000,
              })
            }
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
