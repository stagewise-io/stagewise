import {
  Combobox as ComboboxBase,
  type ComboboxRootChangeEventDetails,
} from '@base-ui/react/combobox';
import type { ImageModelSelectorEntry } from '@shared/available-image-models';
import type { ImageModelEntry } from '@shared/karton-contracts/ui/shared-types';
import { IconChevronDownFill18 } from '@stagewise/icons';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  type ComboboxSize,
  type ComboboxTriggerVariant,
} from '@stagewise/stage-ui/components/combobox';
import { cn } from '@ui/utils';
import {
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import { ImageModelOptions } from './image-model-options';

const KEY_SEPARATOR = '\u001f';
const AUTOMATIC_VALUE = '@@image-auto@@';

type PickerItem = {
  value: string;
  label: string;
  searchText: string;
  entry?: ImageModelSelectorEntry;
  description?: string;
};

function imageModelKey(providerInstanceId: string, modelId: string): string {
  return `${providerInstanceId}${KEY_SEPARATOR}${modelId}`;
}

type ImageModelSelectProps = {
  entries: ImageModelSelectorEntry[];
  selection?: ImageModelEntry;
  automaticDescription: string;
  triggerSize?: ComboboxSize;
  side?: 'top' | 'bottom' | 'left' | 'right';
  triggerVariant?: ComboboxTriggerVariant;
  triggerClassName?: string;
  searchEndAdornment?: ReactNode;
  customTrigger?: (
    triggerProps: ComponentPropsWithoutRef<'button'>,
  ) => ReactElement;
  onSelectionChange: (
    selection: ImageModelEntry | undefined,
    source: 'model' | 'settings',
  ) => void;
};

export function ImageModelSelect({
  entries,
  selection,
  automaticDescription,
  triggerSize,
  side = 'top',
  triggerVariant = 'ghost',
  triggerClassName,
  searchEndAdornment,
  customTrigger,
  onSelectionChange,
}: ImageModelSelectProps) {
  const size = 'xs';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredEntry, setHoveredEntry] =
    useState<ImageModelSelectorEntry | null>(null);

  const items = useMemo<PickerItem[]>(
    () => [
      {
        value: AUTOMATIC_VALUE,
        label: 'Automatic',
        searchText: `Automatic ${automaticDescription}`,
        description: automaticDescription,
      },
      ...entries.map((entry) => ({
        value: imageModelKey(entry.instanceId, entry.modelId),
        label: entry.displayName,
        searchText: `${entry.displayName} ${entry.modelId} ${entry.instanceName}`,
        entry,
        description: entry.instanceName,
      })),
    ],
    [automaticDescription, entries],
  );
  const selectionKey = selection
    ? imageModelKey(selection.providerInstanceId, selection.modelId)
    : undefined;
  const selectedItem =
    items.find((item) => item.value === selectionKey) ?? items[0] ?? null;
  const hoveredSelection =
    hoveredEntry &&
    imageModelKey(hoveredEntry.instanceId, hoveredEntry.modelId) ===
      selectionKey
      ? selection
      : undefined;

  return (
    <Combobox
      value={selectedItem}
      open={open}
      inputValue={query}
      items={items}
      filter={(item: PickerItem, filterQuery) =>
        item.searchText.toLowerCase().includes(filterQuery.toLowerCase())
      }
      isItemEqualToValue={(item, value) => item.value === value.value}
      autoHighlight
      onValueChange={(item) => {
        if (!item) return;
        if (!item.entry) {
          onSelectionChange(undefined, 'model');
          return;
        }
        onSelectionChange(
          {
            providerInstanceId: item.entry.instanceId,
            modelId: item.entry.modelId,
          },
          'model',
        );
      }}
      onOpenChange={(
        nextOpen: boolean,
        eventDetails: ComboboxRootChangeEventDetails,
      ) => {
        if (!nextOpen && eventDetails.reason === 'item-press') {
          eventDetails.cancel();
          return;
        }
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery('');
          setHoveredEntry(null);
        }
      }}
      onItemHighlighted={(item) => {
        if (item !== undefined) setHoveredEntry(item.entry ?? null);
      }}
      onInputValueChange={setQuery}
    >
      {customTrigger ? (
        <ComboboxBase.Trigger
          render={(triggerProps) =>
            customTrigger(triggerProps as ComponentPropsWithoutRef<'button'>)
          }
        />
      ) : (
        <ComboboxTrigger
          size={triggerSize ?? size}
          variant={triggerVariant}
          className={triggerClassName}
        >
          <span className="truncate">{selectedItem?.label ?? 'Automatic'}</span>
          <ComboboxBase.Icon className="shrink-0">
            <IconChevronDownFill18
              className={(triggerSize ?? size) === 'xs' ? 'size-3' : 'size-3.5'}
            />
          </ComboboxBase.Icon>
        </ComboboxTrigger>
      )}

      <ComboboxContent
        side={side}
        size={size}
        className="relative flex-row items-start gap-1 border-0 bg-transparent p-0 shadow-none"
      >
        <div className="flex min-w-64 max-w-72 flex-col items-stretch rounded-lg border border-border-subtle bg-background p-1 shadow-lg">
          <div className="mb-1 flex items-center gap-1 rounded-md">
            <ComboboxInput
              size={size}
              placeholder="Search image models…"
              className="min-w-0 flex-1"
            />
            {searchEndAdornment}
          </div>

          <ComboboxList>
            <div className="scroll-fade-y scroll-fade-4 scrollbar-subtle max-h-48 overflow-y-auto">
              <ComboboxBase.Collection>
                {(item: PickerItem) => (
                  <ComboboxItem key={item.value} value={item} size={size}>
                    <ComboboxItemIndicator />
                    <span className="col-start-2 flex min-w-0 flex-col">
                      <span className="truncate">{item.label}</span>
                      {item.description && (
                        <span className="truncate text-[10px] text-subtle-foreground">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxBase.Collection>
            </div>
            <ComboboxBase.Empty>
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                No results
              </div>
            </ComboboxBase.Empty>
          </ComboboxList>
        </div>

        {hoveredEntry && (
          <div
            className={cn(
              'absolute bottom-0 left-full ml-1 max-h-[var(--available-height)] w-64',
              'scrollbar-subtle overflow-y-auto rounded-lg border border-derived',
              'bg-background text-foreground shadow-elevation-2',
              'fade-in-0 slide-in-from-left-1 animate-in duration-150',
            )}
          >
            <ImageModelOptions
              entry={hoveredEntry}
              settings={hoveredSelection}
              onChange={(field, next) =>
                onSelectionChange(
                  {
                    ...hoveredSelection,
                    providerInstanceId: hoveredEntry.instanceId,
                    modelId: hoveredEntry.modelId,
                    [field]: next,
                  },
                  'settings',
                )
              }
            />
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
