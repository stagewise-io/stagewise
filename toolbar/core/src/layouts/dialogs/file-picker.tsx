import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@stagewise/stage-ui/components/breadcrumb';
import {
  MenuContent,
  MenuTrigger,
  MenuItem,
  Menu,
} from '@stagewise/stage-ui/components/menu';
import { useEffect, useState, useMemo, Fragment } from 'react';
import { FileIcon, FolderIcon, HomeIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
/**
 * Conditionally rendering dialog for file picking.
 * Is only rendered, if a file picker request is active.
 */
export const FilePickerDialog = () => {
  const activeFilePickerRequest = useKartonState((s) => s.filePicker);
  const changeDirectory = useKartonProcedure(
    (p) => p.filePicker.changeDirectory,
  );
  const select = useKartonProcedure((p) => p.filePicker.select);
  const dismiss = useKartonProcedure((p) => p.filePicker.dismiss);

  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  useEffect(() => {
    // Clear all state once the request changes
    setSelectedPaths([]);
  }, [activeFilePickerRequest]);

  if (!activeFilePickerRequest) return null;

  return (
    <Dialog open={true} dismissible={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activeFilePickerRequest.title}</DialogTitle>
          <DialogDescription>
            {activeFilePickerRequest.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <FilePathBreadcrumb />
          <SelectorWindow
            selectedPaths={selectedPaths}
            onSelectionUpdate={setSelectedPaths}
            onDoubleClick={(path, type) => {
              // Navigate to directory on double-click if it's a directory
              if (type === 'directory') {
                changeDirectory(path.length > 0 ? path : '/');
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => void dismiss()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              activeFilePickerRequest.mode === 'file' &&
              selectedPaths.length < 1
            }
            onClick={() => {
              select(
                selectedPaths.length > 0
                  ? selectedPaths
                  : [activeFilePickerRequest.currentPath],
              );
            }}
          >
            {selectedPaths.length === 0
              ? `Select${activeFilePickerRequest.mode === 'directory' ? ' this folder' : ''}`
              : `Select ${selectedPaths.length} ${activeFilePickerRequest.mode === 'directory' ? 'folder' : 'file'}${selectedPaths.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FilePathBreadcrumb = () => {
  const currentPath = useKartonState((s) => s.filePicker?.currentPath) ?? '';

  const normalizedPath = useMemo(
    () => currentPath.replace(/\\/g, '/'),
    [currentPath],
  );
  const pathSegments = useMemo(
    () =>
      normalizedPath.split('/').map((part, index) => ({
        part: part,
        fullPath: normalizedPath
          .split('/')
          .slice(0, index + 1)
          .join('/'),
      })),
    [normalizedPath],
  );

  const segmentsBeforeEllipsis = useMemo(
    () => (pathSegments.length > 2 ? pathSegments.slice(0, 1) : pathSegments),
    [pathSegments],
  );

  const ellipsedSegments = useMemo(
    () => (pathSegments.length > 2 ? pathSegments.slice(1, -2) : []),
    [pathSegments],
  );

  const segmentsAfterEllipsis = useMemo(
    () => (pathSegments.length > 2 ? pathSegments.slice(-2) : []),
    [pathSegments],
  );

  const updatePath = useKartonProcedure((p) => p.filePicker.changeDirectory);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segmentsBeforeEllipsis.map((segment) => (
          <Fragment key={segment.fullPath}>
            <BreadcrumbItem onClick={() => updatePath(segment.fullPath)}>
              {segment.part.length === 0 ? (
                <HomeIcon className="size-3" />
              ) : (
                segment.part
              )}
            </BreadcrumbItem>
            {pathSegments.length !== 3 && (
              <BreadcrumbSeparator className="last:hidden" />
            )}
          </Fragment>
        ))}
        {ellipsedSegments.length > 0 && (
          <Menu>
            <MenuTrigger>
              <BreadcrumbEllipsis />
            </MenuTrigger>
            <MenuContent>
              {ellipsedSegments.map((segment) => (
                <MenuItem
                  key={segment.fullPath}
                  onClick={() => updatePath(segment.fullPath)}
                >
                  {segment.part}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
        {segmentsAfterEllipsis.map((segment) => (
          <Fragment key={segment.fullPath}>
            <BreadcrumbSeparator />
            <BreadcrumbItem onClick={() => updatePath(segment.fullPath)}>
              {segment.part}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

const SelectorWindow = ({
  selectedPaths,
  onSelectionUpdate,
  onDoubleClick,
}: {
  selectedPaths: string[];
  onSelectionUpdate: (paths: string[]) => void;
  onDoubleClick: (path: string, type: string) => void;
}) => {
  const children = useKartonState((s) => s.filePicker?.children);
  const mode = useKartonState((s) => s.filePicker?.mode);

  const allowMultiple = useKartonState((s) => s.filePicker?.multiple);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Combine directories and files, prioritizing directories first
  const allItems = useMemo(() => {
    // Filter based on mode - if mode is 'file', only show files; if 'directory', only show directories
    if (mode === 'file') {
      return children?.filter((item) => item.type === 'file') ?? [];
    } else if (mode === 'directory') {
      return children?.filter((item) => item.type === 'directory') ?? [];
    }
    return children;
  }, [children, mode]);

  const handleItemClick = (
    event: React.MouseEvent,
    item: { path: string; type: string },
    index: number,
  ) => {
    const isShiftClick = event.shiftKey;
    const isCtrlClick = event.ctrlKey || event.metaKey;

    if (
      isShiftClick &&
      lastClickedIndex !== null &&
      allowMultiple &&
      allItems
    ) {
      // Range selection
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeItems = allItems.slice(start, end + 1) ?? [];
      const rangePaths = rangeItems.map((rangeItem) => rangeItem.path);

      // Merge with existing selection, removing duplicates
      const newSelection = Array.from(
        new Set([...selectedPaths, ...rangePaths]),
      );
      onSelectionUpdate(newSelection);
    } else if (isCtrlClick && allowMultiple) {
      // Multi-selection
      const itemPath = item.path;
      const isSelected = selectedPaths.includes(itemPath);

      if (isSelected) {
        // Remove from selection
        onSelectionUpdate(selectedPaths.filter((path) => path !== itemPath));
      } else {
        // Add to selection
        onSelectionUpdate([...selectedPaths, itemPath]);
      }
      setLastClickedIndex(index);
    } else {
      // Solo click - replace selection
      onSelectionUpdate([item.path]);
      setLastClickedIndex(index);
    }
  };

  const handleItemDoubleClick = (item: { path: string; type: string }) => {
    onDoubleClick(item.path, item.type);
  };

  const isItemSelected = (itemPath: string) => selectedPaths.includes(itemPath);

  return (
    <div className="glass-inset h-48 rounded-xl p-1">
      <div
        className="flex size-full flex-col flex-wrap items-start justify-start gap-1 overflow-x-auto overflow-y-hidden p-1.5"
        onClick={() => onSelectionUpdate([])}
      >
        {allItems?.map((item, index) => (
          <Tooltip key={item.path}>
            <TooltipTrigger>
              <button
                key={item.path}
                type="button"
                className={`hover:glass-body flex h-6 w-36 cursor-pointer flex-row items-center justify-start gap-2 rounded-lg p-1 pr-4 pl-2 text-zinc-950 transition-colors hover:bg-blue-500/5 dark:text-white ${
                  isItemSelected(item.path) &&
                  'glass-body bg-blue-500/15 hover:bg-blue-500/20 dark:bg-blue-900/30 dark:hover:bg-blue-900/40'
                }`}
                onClick={(event) => {
                  handleItemClick(event, item, index);
                  event.stopPropagation();
                }}
                onDoubleClick={() => handleItemDoubleClick(item)}
              >
                {item.type === 'directory' ? (
                  <FolderIcon className="size-3 shrink-0 text-blue-600" />
                ) : (
                  <FileIcon className="size-3 shrink-0 text-violet-600" />
                )}
                <span className="truncate">
                  {item.path.replace(/\\/g, '/').split('/').pop()}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {item.path.replace(/\\/g, '/').split('/').pop()}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};
