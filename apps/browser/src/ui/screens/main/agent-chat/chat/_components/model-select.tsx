import {
  Combobox as ComboboxBase,
  type ComboboxRootChangeEventDetails,
  type ComboboxRootHighlightEventDetails,
} from '@base-ui/react/combobox';
import {
  IconBrainOutline18,
  IconChevronDownFill18,
  IconGear3Outline18,
  IconXmarkOutline18,
} from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Radio,
  RadioGroup,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import {
  Popover,
  PopoverContent,
} from '@stagewise/stage-ui/components/popover';
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
import { getAvailableModel, getModelAlias } from '@shared/available-models';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  type ComponentProps,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@ui/utils';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import {
  getDefaultThinkingOption,
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
import { resolveModelDisplay } from './model-presets-shared';
import { enablePatches, produceWithPatches } from 'immer';

enablePatches();

// ---------------------------------------------------------------------------
// Composite key helpers — encode (instanceId, modelId) as a single string
// for the Combobox value. Uses ASCII unit separator (\u001f) as delimiter.
// ---------------------------------------------------------------------------

const KEY_SEPARATOR = '\u001f';
const PRESET_VALUE_PREFIX = '@@preset@@';

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

function encodePresetKey(presetId: string): string {
  return `${PRESET_VALUE_PREFIX}${presetId}`;
}

function decodePresetKey(value: string): string | null {
  if (!value.startsWith(PRESET_VALUE_PREFIX)) return null;
  return value.slice(PRESET_VALUE_PREFIX.length);
}

const DISABLED_THINKING_VALUE = '@@thinking-off@@';

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

type PopoverOpenChangeHandler = NonNullable<
  ComponentProps<typeof Popover>['onOpenChange']
>;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ModelDetailCard({
  entry,
  thinkingModel,
  thinkingOverride,
  thinkingDefaultOptions,
  onThinkingChange,
}: {
  entry: SelectableEntry;
  thinkingModel?: ThinkingPanelModel;
  thinkingOverride?: ModelThinkingOverride;
  thinkingDefaultOptions?: ModelThinkingDefaultOptions;
  onThinkingChange: (override: ModelThinkingOverride) => void;
}): React.ReactNode {
  const { displayName, description, contextLabel, pricingMultiplier, isAlias } =
    entry;
  const thinkingDisplay = thinkingModel
    ? getModelThinkingDisplayState(
        thinkingModel,
        thinkingOverride,
        thinkingDefaultOptions,
      )
    : null;
  const allThinkingOptions = thinkingModel
    ? getModelThinkingOptions(thinkingModel, thinkingDefaultOptions)
    : [];
  const thinkingOptions = allThinkingOptions.filter((option) => option.enabled);
  const defaultThinkingOption = thinkingModel
    ? getDefaultThinkingOption(thinkingModel, thinkingDefaultOptions)
    : undefined;
  const radioLabelClassName = cn(
    'w-full rounded-md px-1 py-0.5',
    isAlias ? 'cursor-default' : 'cursor-pointer hover:bg-hover-derived',
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="font-semibold">{displayName}</div>
        <div className="text-muted-foreground">{description}</div>
        <div className="text-[10px] text-muted-foreground/70">
          {contextLabel}
          {pricingMultiplier != null && (
            <>
              {' · '}
              <span className="inline-flex items-center">
                {pricingMultiplier}
                <IconXmarkOutline18 className="inline size-2" />$
              </span>
            </>
          )}
        </div>
      </div>

      {thinkingDisplay && (
        <div className="border-derived-subtle border-t px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              Reasoning effort
            </span>
            {isAlias && <span className="text-muted-foreground">Fixed</span>}
          </div>
          <RadioGroup
            value={
              thinkingDisplay.enabled
                ? thinkingDisplay.value
                : DISABLED_THINKING_VALUE
            }
            disabled={isAlias}
            aria-label={`Reasoning effort for ${displayName}`}
            className="gap-1"
            onValueChange={(value) => {
              if (typeof value !== 'string') return;
              if (value === DISABLED_THINKING_VALUE) {
                const disabledOption = allThinkingOptions.find(
                  (option) => !option.enabled,
                );
                onThinkingChange({
                  enabled: false,
                  provider:
                    disabledOption?.provider ?? thinkingDisplay.provider,
                  value: disabledOption?.value ?? thinkingDisplay.value,
                });
                return;
              }
              const option = thinkingOptions.find(
                (thinkingOption) => thinkingOption.value === value,
              );
              if (!option) return;
              onThinkingChange({
                enabled: true,
                provider: option.provider,
                value: option.value,
              });
            }}
          >
            <RadioLabel size="xs" className={radioLabelClassName}>
              <Radio value={DISABLED_THINKING_VALUE} size="xs" />
              <span>Off</span>
            </RadioLabel>
            {thinkingOptions.map((option) => (
              <RadioLabel
                key={option.value}
                size="xs"
                className={radioLabelClassName}
              >
                <Radio value={option.value} size="xs" />
                <span>{option.label}</span>
                {option.value === defaultThinkingOption?.value && (
                  <span className="ml-auto text-[10px] text-subtle-foreground">
                    Default
                  </span>
                )}
              </RadioLabel>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}

interface ModelSelectProps {
  onModelChange?: () => void;
}

const EMPTY_MODEL_THINKING_OVERRIDES: UserPreferences['agent']['modelThinkingOverrides'] =
  {};
const EMPTY_MODEL_PRESETS: UserPreferences['agent']['modelPresets'] = [];

/** A preset entry prepared for display in the dropdown. */
interface PresetEntry {
  id: string;
  name: string;
  modelDisplayName: string;
  modelId: string;
  providerInstanceId?: string;
  thinkingLabel?: string;
}

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
  const modelPresets = useKartonState(
    (s) => s.preferences.agent.modelPresets ?? EMPTY_MODEL_PRESETS,
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

  // Group entries by provider instance.
  // Stagewise inference instances are sorted last so that user-connected
  // providers appear at the top of the dropdown. Array.sort is stable in
  // modern engines (per ES2019), so non-stagewise groups preserve their
  // original insertion order.
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
    return Array.from(groups.values()).sort((a, b) => {
      const aStagewise = a.typeId === 'stagewise';
      const bStagewise = b.typeId === 'stagewise';
      if (aStagewise !== bStagewise) return aStagewise ? 1 : -1;
      return 0;
    });
  }, [selectableEntries]);

  // Build preset entries for the dropdown
  const presetEntries = useMemo<PresetEntry[]>(() => {
    return modelPresets.map((preset) => {
      const mainModel = preset.models[0];
      const display = mainModel
        ? resolveModelDisplay(
            selectableEntries,
            mainModel.modelId,
            mainModel.providerInstanceId,
          )
        : undefined;
      let thinkingLabel: string | undefined;
      if (mainModel?.thinkingOverride?.enabled) {
        thinkingLabel = mainModel.thinkingOverride.value ?? 'Thinking';
      }
      return {
        id: preset.id,
        name: preset.name,
        modelDisplayName:
          display?.displayName ?? mainModel?.modelId ?? 'Unknown',
        modelId: mainModel?.modelId ?? '',
        providerInstanceId: mainModel?.providerInstanceId,
        thinkingLabel,
      };
    });
  }, [modelPresets, selectableEntries]);

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

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return presetEntries;
    return presetEntries.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.modelDisplayName.toLowerCase().includes(q),
    );
  }, [presetEntries, query]);

  const filteredEntryKeys = useMemo(
    () =>
      filteredGrouped.flatMap((g) =>
        g.entries.map((e) => encodeKey(e.instanceId, e.modelId)),
      ),
    [filteredGrouped],
  );

  const allEntryKeys = useMemo(
    () =>
      groupedByInstance.flatMap((group) =>
        group.entries.map((entry) =>
          encodeKey(entry.instanceId, entry.modelId),
        ),
      ),
    [groupedByInstance],
  );

  const presetKeys = useMemo(
    () => presetEntries.map((p) => encodePresetKey(p.id)),
    [presetEntries],
  );

  const filteredPresetKeys = useMemo(
    () => filteredPresets.map((p) => encodePresetKey(p.id)),
    [filteredPresets],
  );

  const filteredItemValues = useMemo(
    () =>
      query.trim() === ''
        ? [...presetKeys, ...allEntryKeys]
        : [...filteredPresetKeys, ...filteredEntryKeys],
    [allEntryKeys, filteredEntryKeys, presetKeys, filteredPresetKeys, query],
  );

  const hasFilteredResults =
    filteredEntryKeys.length > 0 || filteredPresetKeys.length > 0;

  // Active preset — when set, the combobox shows the preset as selected
  // instead of the underlying model.
  const activePresetId = preferences.agent.activePresetId;
  const activePreset = useMemo(
    () =>
      activePresetId
        ? modelPresets.find((p) => p.id === activePresetId)
        : undefined,
    [activePresetId, modelPresets],
  );

  // Currently selected entry
  const selectedKey = useMemo(() => {
    if (activePreset) return encodePresetKey(activePreset.id);
    if (!selectedModel) return null;
    const instId = selectedProviderInstanceId ?? DEFAULT_INSTANCE_ID;
    return encodeKey(instId, selectedModel);
  }, [selectedModel, selectedProviderInstanceId, activePreset]);

  const selectedEntry = selectedKey ? entryMap.get(selectedKey) : undefined;

  const selectedDisplayName = activePreset
    ? activePreset.name
    : (selectedEntry?.displayName ?? selectedModel ?? 'Select model');

  const selectedThinkingLabel = activePreset
    ? undefined
    : selectedEntry?.isAlias
      ? undefined
      : selectedEntry?.thinkingLabel;

  const inputRef = useRef<HTMLInputElement>(null);

  // Side-panel hover state
  const popupAnchorRef = useRef<HTMLDivElement>(null);
  const detailPopupRef = useRef<HTMLDivElement>(null);
  const [hoveredEntry, setHoveredEntry] = useState<SelectableEntry | null>(
    null,
  );
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
      clearTimerRef.current = undefined;
    }, 150);
  }, [cancelPendingClear]);

  useEffect(() => () => cancelPendingClear(), [cancelPendingClear]);

  const hoveredThinking = useMemo(() => {
    if (!hoveredEntry) return null;
    const instance = instanceMap.get(hoveredEntry.instanceId);
    const catalogModel = getAvailableModel(hoveredEntry.targetModelId);
    const model: ThinkingPanelModel | undefined =
      catalogModel ??
      (hoveredEntry.thinkingEnabled
        ? {
            modelId: hoveredEntry.targetModelId,
            modelDisplayName: hoveredEntry.displayName,
            providerOptions: {},
            officialProvider: instance
              ? getVendorForInstance(instance)
              : undefined,
            thinkingEnabled: true,
          }
        : undefined);

    return {
      model,
      override: hoveredEntry.isAlias
        ? getModelAlias(hoveredEntry.modelId)?.thinkingPreset
        : modelThinkingOverrides[hoveredEntry.instanceId]?.[
            hoveredEntry.targetModelId
          ],
      defaultOptions: instance
        ? getInstanceThinkingDefaultOptions(instance)
        : undefined,
    };
  }, [hoveredEntry, instanceMap, modelThinkingOverrides]);

  const handleItemHighlighted = useCallback(
    (
      value: string | undefined,
      eventDetails: ComboboxRootHighlightEventDetails,
    ) => {
      const entry = value ? entryMap.get(value) : undefined;
      if (entry) {
        cancelPendingClear();
        setHoveredEntry(entry);
      } else if (value !== undefined || eventDetails.reason !== 'pointer') {
        cancelPendingClear();
        setHoveredEntry(null);
      } else {
        scheduleClear();
      }
    },
    [cancelPendingClear, entryMap, scheduleClear],
  );

  const handleValueChange = useCallback(
    async (value: string | null) => {
      if (!value) return;
      // Check for preset selection
      const presetId = decodePresetKey(value);
      if (presetId) {
        const preset = modelPresets.find((p) => p.id === presetId);
        if (preset && openAgent) {
          const mainModel = preset.models[0];
          if (mainModel) {
            setSelectedModel(
              openAgent,
              mainModel.modelId as ModelId,
              mainModel.providerInstanceId,
            );
          }
          // Set activePresetId so the agent resolves the model and
          // thinking overrides from the *current* preset definition on
          // every step. We deliberately do NOT copy the preset's
          // thinking overrides into global `modelThinkingOverrides` —
          // those are resolved dynamically via the host's
          // `getActivePresetModels()` so that editing the preset in
          // settings takes effect on the next turn.
          const [, patches] = produceWithPatches(preferences, (draft) => {
            draft.agent.activePresetId = preset.id;
          });
          await updatePreferences(patches);
          onModelChange?.();
        }
        return;
      }
      const decoded = decodeKey(value);
      if (!decoded) return;
      if (!openAgent) return;
      // Clear active preset BEFORE setting the model so runStep
      // doesn't see a stale activePresetId and overwrite the
      // user's chosen model via setActiveModel.
      if (preferences.agent.activePresetId) {
        const [, patches] = produceWithPatches(preferences, (draft) => {
          draft.agent.activePresetId = undefined;
        });
        await updatePreferences(patches);
      }
      setSelectedModel(
        openAgent,
        decoded.modelId as ModelId,
        decoded.instanceId,
      );
      onModelChange?.();
    },
    [
      openAgent,
      setSelectedModel,
      onModelChange,
      modelPresets,
      preferences,
      updatePreferences,
    ],
  );

  const closeSelect = useCallback(() => {
    cancelPendingClear();
    setOpen(false);
    setHoveredEntry(null);
    setQuery('');
  }, [cancelPendingClear]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean, eventDetails: ComboboxRootChangeEventDetails) => {
      if (!nextOpen && eventDetails.reason === 'item-press') {
        eventDetails.cancel();
        return;
      }

      const detailPopup = detailPopupRef.current;
      const isDetailPopupInteraction =
        detailPopup &&
        ((eventDetails.reason === 'outside-press' &&
          eventDetails.event.composedPath().includes(detailPopup)) ||
          (eventDetails.reason === 'focus-out' &&
            eventDetails.event instanceof FocusEvent &&
            eventDetails.event.relatedTarget instanceof Node &&
            detailPopup.contains(eventDetails.event.relatedTarget)));

      if (!nextOpen && isDetailPopupInteraction) {
        eventDetails.cancel();
        return;
      }

      if (nextOpen) setOpen(true);
      else closeSelect();
    },
    [closeSelect],
  );

  const handleDetailOpenChange = useCallback(
    ((nextOpen, eventDetails) => {
      if (!nextOpen && eventDetails.reason === 'escape-key') closeSelect();
    }) satisfies PopoverOpenChangeHandler,
    [closeSelect],
  );

  const handleSelectThinkingOption = useCallback(
    async (entry: SelectableEntry, override: ModelThinkingOverride) => {
      if (!openAgent || entry.isAlias) return;

      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.agent.activePresetId = undefined;
        let instanceOverrides =
          draft.agent.modelThinkingOverrides[entry.instanceId];
        if (!instanceOverrides) {
          instanceOverrides = {};
          draft.agent.modelThinkingOverrides[entry.instanceId] =
            instanceOverrides;
        }
        instanceOverrides[entry.targetModelId] = override;
      });
      await updatePreferences(patches);
      setSelectedModel(openAgent, entry.modelId as ModelId, entry.instanceId);
      onModelChange?.();
    },
    [
      onModelChange,
      openAgent,
      preferences,
      setSelectedModel,
      updatePreferences,
    ],
  );

  const handleCycleThinkingEffort = useCallback(() => {
    if (!selectedModel) return false;

    // Aliases use fixed thinking presets — cycling is disabled for them.
    if (getModelAlias(selectedModel)) return false;

    // When a preset is active, its per-model thinking override takes
    // precedence over global modelThinkingOverrides (see
    // resolveThinkingProviderOptions). Cycling would write a global
    // override that has no effect on the next agent turn. Users should
    // edit the preset's thinking in settings instead.
    if (activePresetId) return false;

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
    activePresetId,
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
      items={[...presetKeys, ...allEntryKeys]}
      filteredItems={filteredItemValues}
      autoHighlight
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      onItemHighlighted={handleItemHighlighted}
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
            ref={popupAnchorRef}
            className="relative"
            onMouseLeave={scheduleClear}
          >
            <ComboboxBase.Popup
              className={cn(
                'flex min-w-64 max-w-72 origin-(--transform-origin) flex-col items-stretch text-xs',
                'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-ending-style:opacity-0',
                'data-starting-style:scale-90 data-starting-style:opacity-0',
              )}
            >
              <div className="mb-1 flex items-center gap-1 rounded-md">
                <ComboboxInput
                  ref={inputRef}
                  size="xs"
                  placeholder="Search…"
                  className="min-w-0 flex-1"
                />
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Open model settings"
                      className="shrink-0"
                      onClick={() =>
                        void openSettings({ section: 'models-providers' })
                      }
                    >
                      <IconGear3Outline18 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Model settings</TooltipContent>
                </Tooltip>
              </div>

              <ComboboxList>
                <div className="scroll-fade-y scroll-fade-4 scrollbar-subtle max-h-48 overflow-y-auto">
                  {filteredPresets.length > 0 && (
                    <ComboboxGroup className="mt-0">
                      <ComboboxGroupLabel className="px-1.5 pb-1 font-normal text-sidebar-foreground text-xs">
                        Presets
                      </ComboboxGroupLabel>
                      {filteredPresets.map((preset) => (
                        <PresetItem
                          key={encodePresetKey(preset.id)}
                          preset={preset}
                        />
                      ))}
                    </ComboboxGroup>
                  )}
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
              </ComboboxList>
            </ComboboxBase.Popup>
          </div>
        </ComboboxBase.Positioner>
      </ComboboxBase.Portal>

      <Popover
        open={hoveredEntry !== null}
        onOpenChange={handleDetailOpenChange}
      >
        {hoveredEntry && (
          <PopoverContent
            ref={detailPopupRef}
            anchor={popupAnchorRef.current}
            side="right"
            sideOffset={4}
            align="end"
            collisionPadding={4}
            collisionAvoidance={{
              side: 'flip',
              align: 'shift',
              fallbackAxisSide: 'none',
            }}
            initialFocus={false}
            finalFocus={false}
            aria-label={`Model details for ${hoveredEntry.displayName}`}
            onMouseEnter={cancelPendingClear}
            onMouseLeave={scheduleClear}
            className={cn(
              'scrollbar-subtle max-h-[var(--available-height)] w-64 gap-0 overflow-y-auto p-0 text-xs',
              'border-derived',
              'data-ending-style:scale-95 data-starting-style:scale-95',
            )}
          >
            <ModelDetailCard
              key={encodeKey(hoveredEntry.instanceId, hoveredEntry.modelId)}
              entry={hoveredEntry}
              thinkingModel={hoveredThinking?.model}
              thinkingOverride={hoveredThinking?.override}
              thinkingDefaultOptions={hoveredThinking?.defaultOptions}
              onThinkingChange={(override) =>
                handleSelectThinkingOption(hoveredEntry, override)
              }
            />
          </PopoverContent>
        )}
      </Popover>
    </Combobox>
  );
});

const ModelItem = memo(function ModelItem({
  entry,
}: {
  entry: SelectableEntry;
}) {
  const itemValue = encodeKey(entry.instanceId, entry.modelId);

  return (
    <ComboboxItem value={itemValue} size="xs">
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
            <span className="inline-flex items-center gap-1 text-subtle-foreground">
              <IconBrainOutline18 className="size-2.75" />
              {!entry.isAlias && entry.thinkingLabel}
            </span>
          </span>
        )}
      </span>
    </ComboboxItem>
  );
});

const PresetItem = memo(function PresetItem({
  preset,
}: {
  preset: PresetEntry;
}) {
  const itemValue = encodePresetKey(preset.id);
  return (
    <ComboboxItem value={itemValue} size="xs">
      <ComboboxItemIndicator />
      <span className="col-start-2 flex min-w-0 flex-col gap-0 text-xs">
        <span className="truncate font-medium">{preset.name}</span>
        <span className="truncate text-[10px] text-subtle-foreground">
          {preset.modelDisplayName}
          {preset.thinkingLabel && ` · ${preset.thinkingLabel}`}
        </span>
      </span>
    </ComboboxItem>
  );
});
