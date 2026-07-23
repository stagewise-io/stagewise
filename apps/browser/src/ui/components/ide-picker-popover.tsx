import { useMemo, type ReactElement } from 'react';
import { Select, type SelectItem } from '@stagewise/stage-ui/components/select';
import { IdeLogo } from '@ui/components/ide-logo';
import { IDE_SELECTION_ITEMS } from '@ui/utils';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';

export function IdePickerPopover({
  children,
  onSelect,
}: {
  children: ReactElement;
  onSelect: (ide: OpenFilesInIde) => void;
}) {
  const items: SelectItem<OpenFilesInIde>[] = useMemo(
    () => [
      { value: 'cursor', label: 'Cursor', group: 'Open files in:' },
      { value: 'vscode', label: 'VS Code', group: 'Open files in:' },
      { value: 'zed', label: 'Zed', group: 'Open files in:' },
      { value: 'kiro', label: 'Kiro', group: 'Open files in:' },
      { value: 'windsurf', label: 'Windsurf', group: 'Open files in:' },
      { value: 'trae', label: 'Trae', group: 'Open files in:' },
      {
        value: 'fileManager',
        label: IDE_SELECTION_ITEMS.fileManager,
        group: 'Open files in:',
      },
    ],
    [],
  );

  const itemsWithIcons: SelectItem<OpenFilesInIde>[] = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        icon: <IdeLogo ide={item.value} className="size-4" />,
      })),
    [items],
  );

  return (
    <Select<OpenFilesInIde>
      items={itemsWithIcons}
      onValueChange={(value) => onSelect(value)}
      placeholder="Open files in…"
      size="xs"
      side="top"
      sideOffset={6}
      align="start"
      showItemIndicator={false}
      customTrigger={(triggerProps) => (
        <button type="button" {...triggerProps}>
          {children}
        </button>
      )}
    />
  );
}
