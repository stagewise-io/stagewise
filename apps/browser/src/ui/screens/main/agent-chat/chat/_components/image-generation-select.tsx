import { ImageIcon } from 'lucide-react';
import { IconGear3Outline18 } from '@stagewise/icons';
import {
  findImageModelEntry,
  IMAGE_GENERATION_SETTINGS,
} from '@shared/available-image-models';
import type { ImageModelEntry } from '@shared/karton-contracts/ui/shared-types';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useImageModelEntries } from '@ui/hooks/use-image-models';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { ImageModelSelect } from '@ui/components/image-model-select';
import { formatImageGenerationSettings } from '@ui/components/image-model-options';
import { cn } from '@ui/utils';
import { memo } from 'react';

function selectsUtilityDefault(
  selection: ImageModelEntry | undefined,
  utilityDefault: ImageModelEntry | undefined,
): boolean {
  if (
    !selection ||
    !utilityDefault ||
    selection.providerInstanceId !== utilityDefault.providerInstanceId ||
    selection.modelId !== utilityDefault.modelId
  )
    return false;

  return IMAGE_GENERATION_SETTINGS.every(
    ({ field }) => selection[field] === utilityDefault[field],
  );
}

export const ImageGenerationSelect = memo(function ImageGenerationSelect() {
  const [openAgent] = useOpenAgent();
  const overrides = useKartonState((state) =>
    openAgent
      ? state.agents.instances[openAgent]?.state.imageGenerationOverrides
      : undefined,
  );
  const configuredDefault = useKartonState(
    (state) => state.preferences.agent.utilityModels.imageGeneration,
  );
  const setOverrides = useKartonProcedure(
    (procedures) => procedures.agents.setImageGenerationOverrides,
  );
  const openSettings = useKartonProcedure(
    (procedures) => procedures.appScreen.openSettings,
  );
  const entries = useImageModelEntries();

  const modelOverride =
    overrides && 'modelId' in overrides ? overrides : undefined;
  const storedOverrideEntry = findImageModelEntry(entries, modelOverride);
  const defaultEntry = findImageModelEntry(entries, configuredDefault);
  const automaticOverride = !!overrides && 'mode' in overrides;
  const overrideEntry = selectsUtilityDefault(modelOverride, configuredDefault)
    ? undefined
    : storedOverrideEntry;
  const menuSelection = automaticOverride
    ? undefined
    : overrideEntry
      ? modelOverride
      : defaultEntry
        ? configuredDefault
        : undefined;
  const overrideSelection = overrideEntry ? modelOverride : undefined;
  const hasOverride = automaticOverride || !!overrideSelection;

  const persistOverrides = (
    next: ImageModelEntry | undefined,
    source: 'model' | 'settings',
  ) => {
    if (!openAgent) return;
    void setOverrides(
      openAgent,
      next
        ? selectsUtilityDefault(next, configuredDefault) ||
          (source === 'model' &&
            next.providerInstanceId === configuredDefault?.providerInstanceId &&
            next.modelId === configuredDefault.modelId)
          ? undefined
          : next
        : { mode: 'automatic' },
    );
  };
  const summary = automaticOverride
    ? 'Automatic'
    : [
        overrideEntry?.displayName,
        formatImageGenerationSettings(overrideSelection),
      ]
        .filter(Boolean)
        .join(' · ');

  if (entries.length === 0) return null;

  return (
    <ImageModelSelect
      entries={entries}
      selection={menuSelection}
      onSelectionChange={persistOverrides}
      automaticDescription="The agent chooses instead of using the utility default."
      side="top"
      searchEndAdornment={
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Open image model settings"
              onClick={() => void openSettings({ section: 'models-providers' })}
            >
              <IconGear3Outline18 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Image model defaults</TooltipContent>
        </Tooltip>
      }
      customTrigger={(triggerProps) => (
        <button
          type="button"
          {...triggerProps}
          aria-label="Image generation settings"
          title={hasOverride ? summary : 'Image generation settings'}
          className={cn(
            'inline-flex h-5 min-w-5 max-w-64 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 text-muted-foreground text-xs transition-colors',
            'hover:bg-surface-1 hover:text-foreground data-popup-open:bg-surface-1 data-popup-open:text-foreground',
            hasOverride ? 'w-auto px-1.5' : 'w-5',
          )}
        >
          <ImageIcon className="size-3 shrink-0" />
          {hasOverride ? (
            <span className="truncate">{summary || 'Image settings'}</span>
          ) : null}
        </button>
      )}
    />
  );
});
