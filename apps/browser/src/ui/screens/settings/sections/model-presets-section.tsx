import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { enablePatches, produceWithPatches } from 'immer';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import type {
  ModelThinkingOverride,
  PresetModelEntry,
  UtilityModelEntry,
  UserPreferences,
} from '@shared/karton-contracts/ui/shared-types';
import {
  getInstanceThinkingDefaultOptions,
  getSelectableModelEntries,
  getVendorForInstance,
  isModelEntryValid,
  type ModelSelectorEntry,
} from '@shared/provider-instance-helpers';
import { resolveModelDisplay } from '@ui/screens/main/agent-chat/chat/_components/model-presets-shared';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Radio,
  RadioGroup,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import {
  IconPlusOutline18,
  IconTrashOutline18,
  IconGripDotsVerticalOutline18,
  IconTriangleWarningOutline18,
  IconPenOutline18,
  IconBrainOutline18,
} from '@stagewise/icons';
import {
  getModelThinkingDisplayState,
  getModelThinkingOptions,
  type ModelThinkingDefaultOptions,
  type ThinkingPanelModel,
} from '@ui/utils/model-thinking';
import { cn } from '@ui/utils';

enablePatches();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UtilityTask = 'titleGeneration' | 'contextCompression';

type ProviderInstance = NonNullable<
  UserPreferences['providerInstances']
>[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function modelKey(m: { modelId: string; providerInstanceId?: string }): string {
  return `${m.modelId}::${m.providerInstanceId ?? ''}`;
}

/** Build a ThinkingPanelModel from a selector entry. */
function buildThinkingModel(
  entry: ModelSelectorEntry,
  instanceMap: Map<string, ProviderInstance>,
): ThinkingPanelModel | undefined {
  if (entry.catalogModel) return entry.catalogModel;
  if (entry.thinkingEnabled) {
    const instance = instanceMap.get(entry.instanceId);
    const vendor = instance ? getVendorForInstance(instance) : undefined;
    return {
      modelId: entry.targetModelId,
      modelDisplayName: entry.displayName,
      providerOptions: {},
      officialProvider: vendor,
      thinkingEnabled: true,
    };
  }
  return undefined;
}

/** Convert a ModelSelectorEntry to a model entry, stripping the
 *  `stagewise-default` provider instance (which is implicit). */
function selectorToModelEntry(entry: ModelSelectorEntry): {
  modelId: string;
  providerInstanceId?: string;
} {
  return {
    modelId: entry.modelId,
    ...(entry.instanceId !== 'stagewise-default'
      ? { providerInstanceId: entry.instanceId }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Sortable Model Item (shared by all model lists)
// ---------------------------------------------------------------------------

function SortableModelItem({
  itemKey,
  label,
  isValid,
  displayName,
  instanceName,
  onRemove,
  thinkingOverride,
  isExpanded,
  onToggleExpand,
  onThinkingChange,
  onThinkingReset,
  thinkingModel,
  thinkingDefaultOptions,
}: {
  itemKey: string;
  label?: string;
  isValid: boolean;
  displayName: string;
  instanceName: string;
  onRemove: () => void;
  thinkingOverride: ModelThinkingOverride | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onThinkingChange: (override: ModelThinkingOverride) => void;
  onThinkingReset: () => void;
  thinkingModel: ThinkingPanelModel | undefined;
  thinkingDefaultOptions: ModelThinkingDefaultOptions | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemKey });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const canThink = thinkingModel !== undefined;
  const thinkingDisplay = thinkingModel
    ? getModelThinkingDisplayState(
        thinkingModel,
        thinkingOverride,
        thinkingDefaultOptions,
      )
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border border-derived bg-surface',
        isDragging && 'opacity-80 shadow-md',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <IconGripDotsVerticalOutline18 className="size-3.5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            {label && (
              <span className="shrink-0 text-2xs text-muted-foreground">
                {label}
              </span>
            )}
            <span
              className={cn(
                'truncate text-xs',
                !isValid && 'text-muted-foreground line-through',
              )}
            >
              {displayName}
            </span>
          </div>
          <span className="truncate text-2xs text-muted-foreground">
            {instanceName}
          </span>
        </div>
        {!isValid && (
          <span className="flex shrink-0 items-center gap-0.5 text-2xs text-warning-foreground">
            <IconTriangleWarningOutline18 className="size-3" />
            Invalid
          </span>
        )}
        {canThink && thinkingDisplay && (
          <button
            type="button"
            className={cn(
              'flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-2xs transition-colors',
              thinkingDisplay.enabled
                ? 'text-foreground'
                : 'text-muted-foreground',
              'hover:bg-surface-hover',
              isExpanded && 'bg-surface-hover',
            )}
            onClick={onToggleExpand}
          >
            <IconBrainOutline18 className="size-3" />
            {thinkingDisplay.label}
          </button>
        )}
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onRemove}
        >
          <IconTrashOutline18 className="size-3.5" />
        </button>
      </div>
      {isExpanded && canThink && thinkingModel && (
        <div className="border-derived border-t px-2 py-2">
          <InlineThinkingConfig
            model={thinkingModel}
            override={thinkingOverride}
            defaultOptions={thinkingDefaultOptions}
            onChange={onThinkingChange}
            onReset={onThinkingReset}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Picker Dropdown (slim "Add" button)
// ---------------------------------------------------------------------------

function ModelPickerButton({
  entries,
  onPick,
  excludeIds,
}: {
  entries: ModelSelectorEntry[];
  onPick: (entry: ModelSelectorEntry) => void;
  excludeIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const available = useMemo(
    () =>
      entries.filter((e) => !excludeIds.has(`${e.modelId}::${e.instanceId}`)),
    [entries, excludeIds],
  );

  const entryByKey = useMemo(() => {
    const map = new Map<string, ModelSelectorEntry>();
    for (const e of available) {
      map.set(`${e.modelId}::${e.instanceId}`, e);
    }
    return map;
  }, [available]);

  const allKeys = useMemo(
    () => available.map((e) => `${e.modelId}::${e.instanceId}`),
    [available],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return available;
    return available.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.modelId.toLowerCase().includes(q) ||
        e.instanceName.toLowerCase().includes(q),
    );
  }, [available, query]);

  const filteredKeys = useMemo(
    () => filtered.map((e) => `${e.modelId}::${e.instanceId}`),
    [filtered],
  );

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { name: string; entries: ModelSelectorEntry[] }
    >();
    for (const e of filtered) {
      let g = map.get(e.instanceId);
      if (!g) {
        g = { name: e.instanceName, entries: [] };
        map.set(e.instanceId, g);
      }
      g.entries.push(e);
    }
    return Array.from(map.values());
  }, [filtered]);

  const handleValueChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      const entry = entryByKey.get(value);
      if (entry) {
        onPick(entry);
        setOpen(false);
        setQuery('');
      }
    },
    [entryByKey, onPick],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  }, []);

  return (
    <Combobox
      value={null}
      open={open}
      inputValue={query}
      items={allKeys}
      filteredItems={filteredKeys}
      autoHighlight
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      onInputValueChange={setQuery}
      filter={null}
    >
      <ComboboxBase.Trigger className="flex w-full items-center justify-center gap-1 rounded-md border border-derived border-dashed px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-surface hover:text-foreground">
        <IconPlusOutline18 className="size-3" />
        Add
      </ComboboxBase.Trigger>
      <ComboboxContent side="bottom" align="start" sideOffset={4} size="xs">
        <div className="mb-1 rounded-md">
          <ComboboxInput size="xs" placeholder="Search…" />
        </div>
        <ComboboxList>
          <div className="scrollbar-subtle max-h-48 overflow-y-auto">
            {grouped.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                {query.trim() === '' ? 'No models available' : 'No results'}
              </div>
            )}
            {grouped.map((group) => (
              <ComboboxGroup key={group.name}>
                <ComboboxGroupLabel>{group.name}</ComboboxGroupLabel>
                {group.entries.map((entry) => {
                  const key = `${entry.modelId}::${entry.instanceId}`;
                  return (
                    <ComboboxItem key={key} value={key} size="xs">
                      <ComboboxItemIndicator />
                      <span className="col-start-2 truncate">
                        {entry.displayName}
                      </span>
                    </ComboboxItem>
                  );
                })}
              </ComboboxGroup>
            ))}
          </div>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ---------------------------------------------------------------------------
// Inline Thinking Config (compact, for model rows)
// ---------------------------------------------------------------------------

function InlineThinkingConfig({
  model,
  override,
  defaultOptions,
  onChange,
  onReset,
}: {
  model: ThinkingPanelModel;
  override: ModelThinkingOverride | undefined;
  defaultOptions: ModelThinkingDefaultOptions | undefined;
  onChange: (override: ModelThinkingOverride) => void;
  onReset: () => void;
}) {
  const display = getModelThinkingDisplayState(model, override, defaultOptions);
  if (!display) return null;

  const options = getModelThinkingOptions(model, defaultOptions);

  // Only keep enabled options; we prepend our own unified "Off" choice.
  // Some providers (e.g. GPT-5) already include a disabled "none" option —
  // filter it out to avoid redundancy.
  const enabledOptions = options.filter((o) => o.enabled);

  // Sentinel value for the "Off" radio so it never collides with real options
  const OFF_VALUE = '__off';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <IconBrainOutline18 className="size-3 text-muted-foreground" />
        <span className="text-2xs text-muted-foreground">Thinking</span>
      </div>
      <RadioGroup
        value={display.enabled ? display.value : OFF_VALUE}
        onValueChange={(value) => {
          if (typeof value !== 'string') return;
          if (value === OFF_VALUE) {
            onChange({
              enabled: false,
              provider: display.provider,
              value: display.value,
            });
          } else {
            const option = enabledOptions.find((o) => o.value === value);
            if (option) {
              onChange({
                enabled: true,
                provider: option.provider,
                value: option.value,
              });
            }
          }
        }}
        className="flex flex-row flex-wrap gap-2"
      >
        <RadioLabel key={OFF_VALUE} size="xs">
          <Radio value={OFF_VALUE} size="xs" />
          <span>Off</span>
        </RadioLabel>
        {enabledOptions.map((option) => (
          <RadioLabel key={option.value} size="xs">
            <Radio value={option.value} size="xs" />
            <span>{option.label}</span>
          </RadioLabel>
        ))}
      </RadioGroup>
      {display.isOverride && (
        <button
          type="button"
          className="text-2xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          Reset to default
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared hook: resolve display info + thinking model for a list of entries
// ---------------------------------------------------------------------------

function useModelListItems(
  modelEntries: Array<{
    modelId: string;
    providerInstanceId?: string;
    thinkingOverride?: ModelThinkingOverride;
  }>,
  entries: ModelSelectorEntry[],
  preferences: UserPreferences,
) {
  const instanceMap = useMemo(() => {
    const map = new Map<string, ProviderInstance>();
    for (const inst of preferences.providerInstances ?? []) {
      map.set(inst.id, inst);
    }
    return map;
  }, [preferences.providerInstances]);

  const items = useMemo(
    () =>
      modelEntries.map((entry, i) => {
        const display = resolveModelDisplay(
          entries,
          entry.modelId,
          entry.providerInstanceId,
        );
        const valid = isModelEntryValid(
          preferences,
          entry.modelId,
          entry.providerInstanceId,
        );
        const key = modelKey(entry);
        const selectorEntry = entry.providerInstanceId
          ? entries.find(
              (e) =>
                e.modelId === entry.modelId &&
                e.instanceId === entry.providerInstanceId,
            )
          : entries.find((e) => e.modelId === entry.modelId);
        const instance = selectorEntry
          ? instanceMap.get(selectorEntry.instanceId)
          : undefined;
        const thinkingModel = selectorEntry
          ? buildThinkingModel(selectorEntry, instanceMap)
          : undefined;
        const thinkingDefaultOptions = instance
          ? getInstanceThinkingDefaultOptions(instance)
          : undefined;
        return {
          index: i,
          key,
          entry,
          display: display ?? {
            displayName: entry.modelId,
            instanceName: 'Unknown',
          },
          valid,
          thinkingModel,
          thinkingDefaultOptions,
        };
      }),
    [modelEntries, entries, preferences, instanceMap],
  );

  const excludeIds = useMemo(
    () => new Set(modelEntries.map((e) => modelKey(e))),
    [modelEntries],
  );

  return { items, excludeIds };
}

// ---------------------------------------------------------------------------
// Model List (unified — used for global utility models, preset utility
// models, and preset main+fallback models)
// ---------------------------------------------------------------------------

function ModelList({
  label,
  description,
  modelEntries,
  onChange,
  entries,
  preferences,
  itemLabel,
  emptyMessage,
}: {
  label: string;
  description: string;
  modelEntries: Array<{
    modelId: string;
    providerInstanceId?: string;
    thinkingOverride?: ModelThinkingOverride;
  }>;
  onChange: (
    entries: Array<{
      modelId: string;
      providerInstanceId?: string;
      thinkingOverride?: ModelThinkingOverride;
    }>,
  ) => void;
  entries: ModelSelectorEntry[];
  preferences: UserPreferences;
  itemLabel?: (index: number) => string;
  emptyMessage?: string;
}) {
  const { items, excludeIds } = useModelListItems(
    modelEntries,
    entries,
    preferences,
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((i) => i.key === String(active.id));
      const newIndex = items.findIndex((i) => i.key === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      onChange(arrayMove(modelEntries, oldIndex, newIndex));
    },
    [items, modelEntries, onChange],
  );

  const handleAdd = useCallback(
    (entry: ModelSelectorEntry) => {
      onChange([...modelEntries, selectorToModelEntry(entry)]);
    },
    [modelEntries, onChange],
  );

  const handleRemove = useCallback(
    (key: string) => {
      onChange(modelEntries.filter((e) => modelKey(e) !== key));
      setExpandedKey((prev) => (prev === key ? null : prev));
    },
    [modelEntries, onChange],
  );

  const handleThinkingChange = useCallback(
    (key: string, override: ModelThinkingOverride) => {
      onChange(
        modelEntries.map((e) =>
          modelKey(e) === key ? { ...e, thinkingOverride: override } : e,
        ),
      );
    },
    [modelEntries, onChange],
  );

  const handleThinkingReset = useCallback(
    (key: string) => {
      onChange(
        modelEntries.map((e) =>
          modelKey(e) === key ? { ...e, thinkingOverride: undefined } : e,
        ),
      );
    },
    [modelEntries, onChange],
  );

  return (
    <div className="space-y-2">
      <div>
        <h4 className="font-medium text-foreground text-sm">{label}</h4>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {items.map((item) => (
                <SortableModelItem
                  key={item.key}
                  itemKey={item.key}
                  label={itemLabel?.(item.index)}
                  isValid={item.valid}
                  displayName={item.display.displayName}
                  instanceName={item.display.instanceName}
                  onRemove={() => handleRemove(item.key)}
                  thinkingOverride={item.entry.thinkingOverride}
                  isExpanded={expandedKey === item.key}
                  onToggleExpand={() =>
                    setExpandedKey(expandedKey === item.key ? null : item.key)
                  }
                  onThinkingChange={(override) =>
                    handleThinkingChange(item.key, override)
                  }
                  onThinkingReset={() => handleThinkingReset(item.key)}
                  thinkingModel={item.thinkingModel}
                  thinkingDefaultOptions={item.thinkingDefaultOptions}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : emptyMessage ? (
        <div className="rounded-md border border-derived border-dashed px-3 py-2 text-center text-muted-foreground text-xs">
          {emptyMessage}
        </div>
      ) : null}

      <ModelPickerButton
        entries={entries}
        onPick={handleAdd}
        excludeIds={excludeIds}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global Utility Model List (thin wrapper: wires ModelList to Karton state)
// ---------------------------------------------------------------------------

function UtilityModelList({
  task,
  label,
  description,
}: {
  task: UtilityTask;
  label: string;
  description: string;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const modelEntries = preferences.agent.utilityModels[task] ?? [];

  const entries = useMemo(
    () => getSelectableModelEntries(preferences),
    [preferences],
  );

  const handleChange = useCallback(
    (next: UtilityModelEntry[]) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.agent.utilityModels[task] = next;
      });
      void updatePreferences(patches);
    },
    [preferences, task, updatePreferences],
  );

  return (
    <ModelList
      label={label}
      description={description}
      modelEntries={modelEntries}
      onChange={handleChange}
      entries={entries}
      preferences={preferences}
      emptyMessage="No model configured, uses main chat model."
    />
  );
}

// ---------------------------------------------------------------------------
// Preset Card
// ---------------------------------------------------------------------------

function PresetCard({
  preset,
  entries,
  preferences,
  onEdit,
  onDelete,
}: {
  preset: UserPreferences['agent']['modelPresets'][number];
  entries: ModelSelectorEntry[];
  preferences: UserPreferences;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mainModel = preset.models[0];
  const mainDisplay = mainModel
    ? resolveModelDisplay(
        entries,
        mainModel.modelId,
        mainModel.providerInstanceId,
      )
    : undefined;
  const mainValid = mainModel
    ? isModelEntryValid(
        preferences,
        mainModel.modelId,
        mainModel.providerInstanceId,
      )
    : false;

  const fallbackCount = preset.models.length - 1;
  const validFallbacks = preset.models
    .slice(1)
    .filter((f) =>
      isModelEntryValid(preferences, f.modelId, f.providerInstanceId),
    ).length;

  const thinkingLabel = preset.models.find((m) => m.thinkingOverride?.enabled)
    ?.thinkingOverride?.value;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-derived bg-surface p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground text-sm">
            {preset.name}
          </span>
          {!mainValid && (
            <span className="flex shrink-0 items-center gap-0.5 text-2xs text-warning-foreground">
              <IconTriangleWarningOutline18 className="size-3" />
              Invalid model
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="truncate">
            {mainDisplay?.displayName ?? mainModel?.modelId ?? 'No model'}
          </span>
          {fallbackCount > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>
                {fallbackCount} fallback{fallbackCount === 1 ? '' : 's'}
              </span>
              {validFallbacks < fallbackCount && (
                <span className="text-warning-foreground">
                  ({validFallbacks} valid)
                </span>
              )}
            </>
          )}
          {thinkingLabel && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>Thinking: {thinkingLabel}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <IconPenOutline18 className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset Editor Dialog
// ---------------------------------------------------------------------------

function PresetEditorDialog({
  preset,
  open,
  onOpenChange,
  onSave,
  entries,
  preferences,
}: {
  preset?: UserPreferences['agent']['modelPresets'][number];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    id: string;
    name: string;
    models: PresetModelEntry[];
    titleGeneration?: UtilityModelEntry[];
    contextCompression?: UtilityModelEntry[];
  }) => void;
  entries: ModelSelectorEntry[];
  preferences: UserPreferences;
}) {
  const isEdit = !!preset;
  const [name, setName] = useState(preset?.name ?? '');
  const [models, setModels] = useState<PresetModelEntry[]>(
    preset?.models ?? [],
  );
  const [titleGeneration, setTitleGeneration] = useState<
    UtilityModelEntry[] | undefined
  >(preset?.titleGeneration);
  const [contextCompression, setContextCompression] = useState<
    UtilityModelEntry[] | undefined
  >(preset?.contextCompression);

  // Reset state when dialog opens or the preset changes
  useEffect(() => {
    if (open) {
      setName(preset?.name ?? '');
      setModels(preset?.models ?? []);
      setTitleGeneration(preset?.titleGeneration);
      setContextCompression(preset?.contextCompression);
    }
  }, [open, preset?.id]);

  const handleSave = () => {
    if (!name.trim() || models.length === 0) return;
    onSave({
      id: preset?.id ?? generateId(),
      name: name.trim(),
      models,
      titleGeneration,
      contextCompression,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit preset' : 'New preset'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this model configuration preset.'
              : 'Create a named model configuration for one-click switching.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <span className="font-medium text-foreground text-sm">Name</span>
            <Input
              value={name}
              onValueChange={(val) => setName(val)}
              placeholder="e.g. Fast coding, Deep reasoning"
              size="sm"
            />
          </div>

          {/* Models (drag-and-drop, first = main, rest = fallbacks) */}
          <ModelList
            label="Models"
            description="Drag to reorder. First model is the main model; the rest are fallbacks. Click the brain icon to configure thinking per model."
            modelEntries={models}
            onChange={setModels}
            entries={entries}
            preferences={preferences}
            itemLabel={(i) => (i === 0 ? 'Main' : `Fallback ${i}`)}
          />

          {/* Per-preset utility model lists */}
          <div className="space-y-3 border-derived border-t pt-3">
            <ModelList
              label="Title generation"
              description="Models used for title generation when this preset is active. If empty, the main model is used."
              modelEntries={titleGeneration ?? []}
              onChange={(next) =>
                setTitleGeneration(next.length > 0 ? next : undefined)
              }
              entries={entries}
              preferences={preferences}
              emptyMessage="Uses main model."
            />
            <ModelList
              label="Context compression"
              description="Models used for context compression when this preset is active. If empty, the main model is used."
              modelEntries={contextCompression ?? []}
              onChange={(next) =>
                setContextCompression(next.length > 0 ? next : undefined)
              }
              entries={entries}
              preferences={preferences}
              emptyMessage="Uses main model."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange?.(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || models.length === 0}
          >
            {isEdit ? 'Save changes' : 'Create preset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Section Component
// ---------------------------------------------------------------------------

export function ModelPresetsSection() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const presets = preferences.agent.modelPresets ?? [];
  const entries = useMemo(
    () => getSelectableModelEntries(preferences),
    [preferences],
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<
    UserPreferences['agent']['modelPresets'][number] | undefined
  >(undefined);

  const handleSavePreset = useCallback(
    (data: {
      id: string;
      name: string;
      models: PresetModelEntry[];
      titleGeneration?: UtilityModelEntry[];
      contextCompression?: UtilityModelEntry[];
    }) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const existingIndex = draft.agent.modelPresets.findIndex(
          (p) => p.id === data.id,
        );
        const preset = {
          id: data.id,
          name: data.name,
          models: data.models,
          titleGeneration: data.titleGeneration,
          contextCompression: data.contextCompression,
        };
        if (existingIndex >= 0) {
          draft.agent.modelPresets[existingIndex] = preset;
        } else {
          draft.agent.modelPresets.push(preset);
        }
      });
      void updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const handleDeletePreset = useCallback(
    (id: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.agent.modelPresets = draft.agent.modelPresets.filter(
          (p) => p.id !== id,
        );
      });
      void updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const handleAddPreset = () => {
    setEditingPreset(undefined);
    setEditorOpen(true);
  };

  const handleEditPreset = (
    preset: UserPreferences['agent']['modelPresets'][number],
  ) => {
    setEditingPreset(preset);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Default Utility Models */}
      <section className="space-y-4">
        <div>
          <h2 className="font-medium text-foreground text-lg">
            Default utility models
          </h2>
          <p className="text-muted-foreground text-sm">
            These models are used for background tasks when no preset-specific
            configuration is set. The agent tries each model in order until one
            succeeds.
          </p>
        </div>

        <div className="space-y-6">
          <UtilityModelList
            task="titleGeneration"
            label="Title generation"
            description="Models used to generate conversation titles."
          />
          <UtilityModelList
            task="contextCompression"
            label="Context compression"
            description="Models used to compress conversation history."
          />
        </div>
      </section>

      {/* Presets */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-foreground text-lg">Presets</h2>
            <p className="text-muted-foreground text-sm">
              Named model configurations for one-click switching. Shown at the
              top of the model selector.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleAddPreset}>
            <IconPlusOutline18 className="size-3.5" />
            Add preset
          </Button>
        </div>

        {presets.length > 0 ? (
          <div className="space-y-2">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                entries={entries}
                preferences={preferences}
                onEdit={() => handleEditPreset(preset)}
                onDelete={() => handleDeletePreset(preset.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-derived border-dashed px-4 py-6 text-center">
            <p className="text-muted-foreground text-sm">
              No presets configured.
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Create a preset to quickly switch between model configurations.
            </p>
          </div>
        )}
      </section>

      <PresetEditorDialog
        preset={editingPreset}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSavePreset}
        entries={entries}
        preferences={preferences}
      />
    </div>
  );
}
