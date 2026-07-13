import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import { IconXmarkOutline18, IconBrainOutline18 } from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import type { ModelId } from '@shared/available-models';
import { IconChevronDownFill18 } from '@stagewise/icons';
import { getAvailableModel, getModelAlias } from '@shared/available-models';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@ui/utils';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { ModelThinkingPanel } from '@ui/components/model-thinking-panel';
import {
  getEnabledModelThinkingOption,
  getModelThinkingDisplayState,
  getNextModelThinkingOption,
  getModelThinkingOptions,
  type ModelThinkingDefaultOptions,
  type ThinkingPanelModel,
} from '@ui/utils/model-thinking';
import type {
  ModelThinkingOverride,
  ProviderInstanceTypeId,
  UserPreferences,
} from '@shared/karton-contracts/ui/shared-types';
import {
  DEFAULT_INSTANCE_ID,
  getInstanceThinkingDefaultOptions,
  getSelectableModelEntries,
  getVendorForInstance,
  type ModelSelectorEntry,
} from '@shared/provider-instance-helpers';
import { enablePatches, produceWithPatches } from 'immer';

enablePatches();

// ---------------------------------------------------------------------------
// Composite key helpers — encode (instanceId, modelId) as a single string
// for the Combobox value. Uses ASCII unit separator (\u001f) as delimiter.
// ---------------------------------------------------------------------------

const KEY_SEPARATOR = '\u001f';

function encodeKey(instanceId: string, modelId: string): string {
  return `${instanceId}${KEY_SEPARATOR}${modelId}`;
}

function decodeKey(
  value: string,
): { instanceId: string; modelId: string } | null {
  const idx = value.indexOf(KEY_SEPARATOR);
  if (idx === -1) return null;
  return {
    instanceId: value.slice(0, idx),
    modelId: value.slice(idx + 1),
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A selector entry with pre-computed thinking label for rendering. */
interface SelectableEntry extends ModelSelectorEntry {
  thinkingLabel?: string;
}

interface InstanceGroup {
  instanceId: string;
  instanceName: string;
  typeId: ProviderInstanceTypeId;
  entries: SelectableEntry[];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ModelTooltipContent({
  model,
  description,
  context,
  pricingMultiplier,
}: {
  model: string;
  description: string;
  context: string;
  pricingMultiplier?: number;
}): React.ReactNode {
  return (
    <div className="flex w-48 flex-col gap-1.5">
      <div className="font-semibold">{model}</div>
      <div className="text-muted-foreground">{description}</div>
      <div className="text-[10px] text-muted-foreground/70">
        {context}
        {pricingMultiplier != null && (
          <>
            {' · '}
            <span className="inline-inline-flex items-center">
              {pricingMultiplier}
              <IconXmarkOutline18 className="inline size-2" />$
            </span>
          </>
        )}
      </div>
    </div>
  );
}

interface ModelSelectProps {
  onModelChange?: () => void;
}

// Sentinel value for the "Open model settings" row.
const OPEN_MODEL_SETTINGS_VALUE = '@@open model settings@@';

const EMPTY_MODEL_THINKING_OVERRIDES: UserPreferences['agent']['modelThinkingOverrides'] =
  {};

export const ModelSelect = memo(function ModelSelect({
  onModelChange,
}: ModelSelectProps) {
  const [openAgent] = useOpenAgent();
  const selectedModel = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.activeModelId : null,
  );
  const selectedProviderInstanceId = useKartonState((s) =>
    openAgent
      ? s.agents.instances[openAgent]?.state.activeProviderInstanceId
      : null,
  );
  const setSelectedModel = useKartonProcedure((p) => p.agents.setActiveModelId);
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const preferences = useKartonState((s) => s.preferences);
  const modelThinkingOverrides = useKartonState(
    (s) =>
      s.preferences.agent.modelThinkingOverrides ??
      EMPTY_MODEL_THINKING_OVERRIDES,
  );

  // Build a map of instanceId → ProviderInstance for thinking option resolution
  const instanceMap = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<UserPreferences['providerInstances']>[number]
    >();
    for (const inst of preferences.providerInstances ?? []) {
      map.set(inst.id, inst);
    }
    return map;
  }, [preferences.providerInstances]);

  // Build flat model options list from the aggregation utility
  const selectableEntries = useMemo<SelectableEntry[]>(() => {
    const entries = getSelectableModelEntries(preferences);
    return entries.map((entry) => {
      let thinkingLabel: string | undefined;

      if (entry.catalogModel) {
        const instance = instanceMap.get(entry.instanceId);
        const defaultOptions: ModelThinkingDefaultOptions | undefined = instance
          ? getInstanceThinkingDefaultOptions(instance)
          : undefined;

        const alias = entry.isAlias ? getModelAlias(entry.modelId) : undefined;
        const override: ModelThinkingOverride | undefined = alias
          ? alias.thinkingPreset
          : modelThinkingOverrides[entry.instanceId]?.[entry.targetModelId];

        const display = getModelThinkingDisplayState(
          entry.catalogModel,
          override,
          defaultOptions,
        );
        thinkingLabel = display?.label;
      } else if (entry.thinkingEnabled) {
        const instance = instanceMap.get(entry.instanceId);
        const vendor = instance ? getVendorForInstance(instance) : undefined;
        const defaultOptions: ModelThinkingDefaultOptions | undefined = instance
          ? getInstanceThinkingDefaultOptions(instance)
          : undefined;
        const override: ModelThinkingOverride | undefined =
          modelThinkingOverrides[entry.instanceId]?.[entry.targetModelId];
        const display = getModelThinkingDisplayState(
          {
            modelId: entry.targetModelId,
            modelDisplayName: entry.displayName,
            providerOptions: {},
            officialProvider: vendor,
            thinkingEnabled: true,
          },
          override,
          defaultOptions,
        );
        thinkingLabel = display?.label ?? 'Thinking';
      }

      return { ...entry, thinkingLabel };
    });
  }, [preferences, instanceMap, modelThinkingOverrides]);

  // Index by composite key for fast lookups
  const entryMap = useMemo(() => {
    const map = new Map<string, SelectableEntry>();
    for (const e of selectableEntries) {
      map.set(encodeKey(e.instanceId, e.modelId), e);
    }
    return map;
  }, [selectableEntries]);

  // Group entries by provider instance
  const groupedByInstance = useMemo<InstanceGroup[]>(() => {
    const groups = new Map<string, InstanceGroup>();
    for (const entry of selectableEntries) {
      let group = groups.get(entry.instanceId);
      if (!group) {
        group = {
          instanceId: entry.instanceId,
          instanceName: entry.instanceName,
          typeId: entry.typeId,
          entries: [],
        };
        groups.set(entry.instanceId, group);
      }
      group.entries.push(entry);
    }
    return Array.from(groups.values());
  }, [selectableEntries]);

  const [open, setOpen] = useState(false);

  // Search / filter state
  const [query, setQuery] = useState('');

  const filteredGrouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return groupedByInstance;

    return groupedByInstance
      .map((group) => ({
        ...group,
        entries: group.entries.filter(
          (e) =>
            e.displayName.toLowerCase().includes(q) ||
            e.modelId.toLowerCase().includes(q) ||
            e.instanceName.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groupedByInstance, query]);

  const filteredEntryKeys = useMemo(
    () =>
      filteredGrouped.flatMap((g) =>
        g.entries.map((e) => encodeKey(e.instanceId, e.modelId)),
      ),
    [filteredGrouped],
  );

  const allEntryKeys = useMemo(
    () => selectableEntries.map((e) => encodeKey(e.instanceId, e.modelId)),
    [selectableEntries],
  );

  const filteredItemValues = useMemo(
    () =>
      query.trim() === ''
        ? [...allEntryKeys, OPEN_MODEL_SETTINGS_VALUE]
        : filteredEntryKeys.length > 0
          ? [...filteredEntryKeys, OPEN_MODEL_SETTINGS_VALUE]
          : [],
    [allEntryKeys, filteredEntryKeys, query],
  );

  const hasFilteredResults = filteredEntryKeys.length > 0;

  // Currently selected entry
  const selectedKey = useMemo(() => {
    if (!selectedModel) return null;
    const instId = selectedProviderInstanceId ?? DEFAULT_INSTANCE_ID;
    return encodeKey(instId, selectedModel);
  }, [selectedModel, selectedProviderInstanceId]);

  const selectedEntry = selectedKey ? entryMap.get(selectedKey) : undefined;

  const selectedDisplayName =
    selectedEntry?.displayName ?? selectedModel ?? 'Select model';

  const selectedThinkingLabel = selectedEntry?.isAlias
    ? undefined
    : selectedEntry?.thinkingLabel;

  const inputRef = useRef<HTMLInputElement>(null);

  // Side-panel hover state
  const containerRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [hoveredEntry, setHoveredEntry] = useState<SelectableEntry | null>(
    null,
  );
  const [editingEntry, setEditingEntry] = useState<SelectableEntry | null>(
    null,
  );
  const [itemCenterY, setItemCenterY] = useState(0);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current !== undefined) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);

  const scheduleClear = useCallback(() => {
    cancelPendingClear();
    clearTimerRef.current = setTimeout(() => {
      setHoveredEntry(null);
      setEditingEntry(null);
      clearTimerRef.current = undefined;
    }, 150);
  }, [cancelPendingClear]);

  useEffect(() => () => cancelPendingClear(), [cancelPendingClear]);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const { maskStyle: listMaskStyle } = useScrollFadeMask(listScrollRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  const editingThinkingModel = useMemo<ThinkingPanelModel | undefined>(() => {
    if (!editingEntry) return undefined;
    const catalogModel = getAvailableModel(editingEntry.targetModelId);
    if (catalogModel) return catalogModel;
    // Discovered model — build a ThinkingPanelModel from the entry
    if (editingEntry.thinkingEnabled) {
      const instance = instanceMap.get(editingEntry.instanceId);
      const vendor = instance ? getVendorForInstance(instance) : undefined;
      return {
        modelId: editingEntry.targetModelId,
        modelDisplayName: editingEntry.displayName,
        providerOptions: {},
        officialProvider: vendor,
        thinkingEnabled: true,
      };
    }
    return undefined;
  }, [editingEntry, instanceMap]);

  const editingThinkingOverride = useMemo<
    ModelThinkingOverride | undefined
  >(() => {
    if (!editingEntry) return undefined;
    return modelThinkingOverrides[editingEntry.instanceId]?.[
      editingEntry.targetModelId
    ];
  }, [editingEntry, modelThinkingOverrides]);

  const editingThinkingDefaultOptions = useMemo<
    ModelThinkingDefaultOptions | undefined
  >(() => {
    if (!editingEntry) return undefined;
    const instance = instanceMap.get(editingEntry.instanceId);
    return instance ? getInstanceThinkingDefaultOptions(instance) : undefined;
  }, [editingEntry, instanceMap]);

  useLayoutEffect(() => {
    if (!hoveredEntry || !sidePanelRef.current || !containerRef.current) return;
    const panelHeight = sidePanelRef.current.offsetHeight;
    const containerHeight = containerRef.current.offsetHeight;

    let offset = itemCenterY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, Math.max(0, containerHeight - panelHeight));

    setSidePanelOffset(offset);
  }, [hoveredEntry, itemCenterY, editingEntry]);

  const handleItemHover = useCallback(
    (entry: SelectableEntry, element: HTMLElement) => {
      cancelPendingClear();
      const container = containerRef.current;
      if (!container) {
        setHoveredEntry(entry);
        setEditingEntry((current) =>
          current?.instanceId === entry.instanceId &&
          current?.modelId === entry.modelId
            ? current
            : null,
        );
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemRect = element.getBoundingClientRect();
      const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

      setItemCenterY(centerY);
      setHoveredEntry(entry);
      setEditingEntry((current) =>
        current?.instanceId === entry.instanceId &&
        current?.modelId === entry.modelId
          ? current
          : null,
      );
    },
    [cancelPendingClear],
  );

  const handleValueChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      if (value === OPEN_MODEL_SETTINGS_VALUE) {
        void openSettings({ section: 'models-providers' });
        return;
      }
      const decoded = decodeKey(value);
      if (!decoded) return;
      if (!openAgent) return;
      setSelectedModel(
        openAgent,
        decoded.modelId as ModelId,
        decoded.instanceId,
      );
      onModelChange?.();
    },
    [openAgent, openSettings, setSelectedModel, onModelChange],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        cancelPendingClear();
        setHoveredEntry(null);
        setEditingEntry(null);
        setQuery('');
      }
    },
    [cancelPendingClear],
  );

  const handleEditThinking = useCallback(
    (entry: SelectableEntry, event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingEntry((current) =>
        current?.instanceId === entry.instanceId &&
        current?.modelId === entry.modelId
          ? null
          : entry,
      );
    },
    [],
  );

  // Resolve a ThinkingPanelModel from either the catalog or a discovered entry.
  const resolveThinkingModel = useCallback(
    (
      instanceId: string,
      targetModelId: string,
    ): ThinkingPanelModel | undefined => {
      const catalogModel = getAvailableModel(targetModelId);
      if (catalogModel) return catalogModel;
      // Discovered model — construct a ThinkingPanelModel from the entry
      const entry = entryMap.get(encodeKey(instanceId, targetModelId));
      if (!entry?.thinkingEnabled) return undefined;
      const instance = instanceMap.get(instanceId);
      const vendor = instance ? getVendorForInstance(instance) : undefined;
      return {
        modelId: targetModelId,
        modelDisplayName: entry.displayName,
        providerOptions: {},
        officialProvider: vendor,
        thinkingEnabled: true,
      };
    },
    [entryMap, instanceMap],
  );

  const handleSetThinkingEnabled = useCallback(
    async (instanceId: string, targetModelId: string, enabled: boolean) => {
      const model = resolveThinkingModel(instanceId, targetModelId);
      if (!model) return;

      const instance = instanceMap.get(instanceId);
      const route: ModelThinkingDefaultOptions = instance
        ? getInstanceThinkingDefaultOptions(instance)
        : { providerMode: 'stagewise' };

      const option = enabled
        ? getEnabledModelThinkingOption(
            model,
            modelThinkingOverrides[instanceId]?.[targetModelId]?.value,
            route,
          )
        : (getModelThinkingOptions(model, route).find(
            (item) =>
              item.value ===
              modelThinkingOverrides[instanceId]?.[targetModelId]?.value,
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
    [
      modelThinkingOverrides,
      preferences,
      updatePreferences,
      instanceMap,
      resolveThinkingModel,
    ],
  );

  const handleSetThinkingValue = useCallback(
    async (instanceId: string, targetModelId: string, value: string) => {
      const model = resolveThinkingModel(instanceId, targetModelId);
      if (!model) return;

      const instance = instanceMap.get(instanceId);
      const route: ModelThinkingDefaultOptions = instance
        ? getInstanceThinkingDefaultOptions(instance)
        : { providerMode: 'stagewise' };

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
    [preferences, updatePreferences, instanceMap, resolveThinkingModel],
  );

  const handleResetThinkingOverride = useCallback(
    async (instanceId: string, targetModelId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        delete draft.agent.modelThinkingOverrides[instanceId]?.[targetModelId];
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const handleCycleThinkingEffort = useCallback(() => {
    if (!selectedModel) return false;

    // Aliases use fixed thinking presets — cycling is disabled for them.
    if (getModelAlias(selectedModel)) return false;

    const model = getAvailableModel(selectedModel);
    if (!model) return false;
    const targetModelId = model.modelId;
    const instanceId = selectedProviderInstanceId ?? DEFAULT_INSTANCE_ID;

    const instance = instanceMap.get(instanceId);
    const route: ModelThinkingDefaultOptions = instance
      ? getInstanceThinkingDefaultOptions(instance)
      : { providerMode: 'stagewise' };

    const display = getModelThinkingDisplayState(
      model,
      modelThinkingOverrides[instanceId]?.[targetModelId],
      route,
    );
    if (!display) return false;

    const nextOption = getNextModelThinkingOption(model, display.value, route);
    const [, patches] = produceWithPatches(preferences, (draft) => {
      if (!draft.agent.modelThinkingOverrides[instanceId]) {
        draft.agent.modelThinkingOverrides[instanceId] = {};
      }
      draft.agent.modelThinkingOverrides[instanceId][targetModelId] = {
        enabled: true,
        provider: nextOption.provider,
        value: nextOption.value,
      };
    });
    void updatePreferences(patches);
  }, [
    modelThinkingOverrides,
    preferences,
    selectedModel,
    selectedProviderInstanceId,
    instanceMap,
    updatePreferences,
  ]);

  useHotKeyListener(
    useCallback(() => {
      setOpen(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      });
    }, []),
    HotkeyActions.OPEN_MODEL_SELECT,
  );

  useHotKeyListener(
    handleCycleThinkingEffort,
    HotkeyActions.CYCLE_MODEL_THINKING_EFFORT,
  );

  return (
    <Combobox
      value={selectedKey}
      open={open}
      inputValue={query}
      items={[...allEntryKeys, OPEN_MODEL_SETTINGS_VALUE]}
      filteredItems={filteredItemValues}
      autoHighlight
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      onInputValueChange={setQuery}
      filter={null}
    >
      <Tooltip>
        <TooltipTrigger>
          <ComboboxBase.Trigger
            className={cn(
              'group/trigger inline-flex min-w-0 max-w-full cursor-pointer items-center justify-between gap-1 rounded-lg p-0 font-normal text-xs shadow-none transition-colors',
              'focus-visible:outline-1 focus-visible:outline-muted-foreground/35 focus-visible:-outline-offset-2',
              'has-disabled:pointer-events-none has-disabled:opacity-50',
              'bg-transparent text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
              'h-4 w-auto',
            )}
          >
            <span className="min-w-0 truncate">{selectedDisplayName}</span>
            {selectedThinkingLabel && (
              <span className="shrink-0 text-subtle-foreground transition-colors group-hover/trigger:text-muted-foreground group-data-[popup-open]/trigger:text-muted-foreground">
                {selectedThinkingLabel}
              </span>
            )}
            <ComboboxBase.Icon className="shrink-0">
              <IconChevronDownFill18 className="size-3" />
            </ComboboxBase.Icon>
          </ComboboxBase.Trigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2">
              <span>Switch model</span>
              <HotkeyCombo action={HotkeyActions.OPEN_MODEL_SELECT} size="xs" />
            </span>
            <span className="flex items-center justify-between gap-2">
              <span>Change reasoning effort</span>
              <HotkeyCombo
                action={HotkeyActions.CYCLE_MODEL_THINKING_EFFORT}
                size="xs"
              />
            </span>
          </div>
        </TooltipContent>
      </Tooltip>

      <ComboboxBase.Portal>
        <ComboboxBase.Backdrop className="fixed inset-0 z-50" />
        <ComboboxBase.Positioner
          side="top"
          sideOffset={4}
          align="start"
          className="z-50"
        >
          <div
            ref={containerRef}
            className="relative flex flex-row items-start gap-1"
            onMouseLeave={scheduleClear}
          >
            <ComboboxBase.Popup
              className={cn(
                'flex max-w-72 origin-(--transform-origin) flex-col items-stretch gap-0.5 text-xs',
                'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-ending-style:opacity-0',
                'data-starting-style:scale-90 data-starting-style:opacity-0',
              )}
            >
              <div className="mb-1 rounded-md">
                <ComboboxInput ref={inputRef} size="xs" placeholder="Search…" />
              </div>

              <ComboboxList>
                <div
                  ref={listScrollRef}
                  className="mask-alpha scrollbar-subtle max-h-48 overflow-y-auto"
                  style={listMaskStyle}
                >
                  {filteredGrouped.map((group) => (
                    <ComboboxGroup
                      key={group.instanceId}
                      className="mt-1 first:mt-0"
                    >
                      <ComboboxGroupLabel className="px-1.5 pb-1 font-normal text-sidebar-foreground text-xs">
                        {group.instanceName}
                      </ComboboxGroupLabel>
                      {group.entries.map((entry) => (
                        <ModelItem
                          key={encodeKey(entry.instanceId, entry.modelId)}
                          entry={entry}
                          onHighlight={handleItemHover}
                          onEditThinking={handleEditThinking}
                        />
                      ))}
                    </ComboboxGroup>
                  ))}
                </div>

                {!hasFilteredResults && (
                  <div className="px-2 py-1.5 text-muted-foreground text-xs">
                    No results
                  </div>
                )}

                <ComboboxItem value={OPEN_MODEL_SETTINGS_VALUE} size="xs">
                  <ComboboxItemIndicator />
                  <span className="col-start-2 truncate">Model settings</span>
                </ComboboxItem>
              </ComboboxList>
            </ComboboxBase.Popup>

            {/* Animated side panel for model details */}
            {hoveredEntry && (
              <div
                ref={sidePanelRef}
                onMouseEnter={cancelPendingClear}
                className={cn(
                  'absolute left-full ml-1 flex w-64 flex-col rounded-lg border border-derived bg-background text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
                  'fade-in-0 slide-in-from-left-1 animate-in duration-150',
                )}
                style={{ top: sidePanelOffset }}
              >
                {editingThinkingModel && editingEntry ? (
                  <ModelThinkingPanel
                    model={editingThinkingModel}
                    override={editingThinkingOverride}
                    defaultOptions={editingThinkingDefaultOptions}
                    onEnabledChange={(enabled) =>
                      handleSetThinkingEnabled(
                        editingEntry.instanceId,
                        editingEntry.targetModelId,
                        enabled,
                      )
                    }
                    onValueChange={(value) =>
                      handleSetThinkingValue(
                        editingEntry.instanceId,
                        editingEntry.targetModelId,
                        value,
                      )
                    }
                    onReset={() =>
                      handleResetThinkingOverride(
                        editingEntry.instanceId,
                        editingEntry.targetModelId,
                      )
                    }
                  />
                ) : (
                  <div className="p-2.5">
                    <ModelTooltipContent
                      model={hoveredEntry.displayName}
                      description={hoveredEntry.description}
                      context={hoveredEntry.contextLabel}
                      pricingMultiplier={hoveredEntry.pricingMultiplier}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </ComboboxBase.Positioner>
      </ComboboxBase.Portal>
    </Combobox>
  );
});

const ModelItem = memo(function ModelItem({
  entry,
  onHighlight,
  onEditThinking,
}: {
  entry: SelectableEntry;
  onHighlight: (entry: SelectableEntry, element: HTMLElement) => void;
  onEditThinking: (
    entry: SelectableEntry,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (el.hasAttribute('data-highlighted')) onHighlight(entry, el);
    });

    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-highlighted'],
    });

    return () => observer.disconnect();
  }, [entry, onHighlight]);

  const itemValue = encodeKey(entry.instanceId, entry.modelId);

  return (
    <ComboboxItem ref={itemRef} value={itemValue} size="xs">
      <ComboboxItemIndicator />
      <span className="col-start-2 flex min-w-0 flex-row items-center justify-between gap-4 text-xs">
        <div className="flex flex-row items-center gap-1.5">
          <span className="truncate">{entry.displayName}</span>
        </div>
        {entry.thinkingLabel && (
          <span
            className={cn(
              'relative flex h-4 shrink-0 items-center justify-end text-[10px]',
              entry.isAlias ? 'min-w-3' : 'min-w-14',
            )}
          >
            <span
              className={cn(
                'inline-flex items-center gap-1 text-subtle-foreground',
                !entry.isAlias && 'group-data-[highlighted]/item:opacity-0',
              )}
            >
              <IconBrainOutline18 className="size-2.75" />
              {!entry.isAlias && entry.thinkingLabel}
            </span>
            {(entry.catalogModel || entry.thinkingEnabled) &&
              !entry.isAlias && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="absolute right-0 h-auto px-0 py-0 text-[10px] opacity-0 group-data-[highlighted]/item:opacity-100"
                  onClick={(event) => onEditThinking(entry, event)}
                >
                  Edit
                </Button>
              )}
          </span>
        )}
      </span>
    </ComboboxItem>
  );
});
