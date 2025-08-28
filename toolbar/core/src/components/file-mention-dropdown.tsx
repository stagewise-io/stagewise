import { cn } from '@/utils';
import { getFileIcon } from '@/utils/file-icons';
import { LoaderIcon } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { glassyBoxClassName } from './ui/glassy';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  FloatingPortal,
} from '@floating-ui/react';

// Type definitions for fuzzy search results
export interface FileData {
  filepath: string;
  filename: string;
  dirname: string;
  fullpath: string;
}

export interface FuseResult<T> {
  item: T;
  score?: number;
}

interface FileMentionDropdownProps {
  searchResults: FuseResult<FileData>[];
  selectedIndex: number;
  onSelect: (file: FuseResult<FileData>) => void;
  isLoading?: boolean;
  isOpen: boolean;
  referenceEl: HTMLElement | null;
  isToolbarAtBottom?: boolean;
}

export interface FileMentionDropdownRef {
  navigateUp: () => void;
  navigateDown: () => void;
  selectCurrent: () => void;
}

export const FileMentionDropdown = forwardRef<
  FileMentionDropdownRef,
  FileMentionDropdownProps
>(
  (
    {
      searchResults,
      selectedIndex,
      onSelect,
      isLoading,
      isOpen,
      referenceEl,
      isToolbarAtBottom,
    },
    ref,
  ) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Floating UI setup
    const { refs, floatingStyles, placement } = useFloating({
      open: isOpen,
      placement: isToolbarAtBottom ? 'top-start' : 'bottom-start',
      middleware: [
        offset(8), // 8px gap from reference element
        flip({
          fallbackPlacements: isToolbarAtBottom
            ? [
                'top-start',
                'top',
                'top-end',
                'bottom-start',
                'bottom',
                'bottom-end',
              ]
            : [
                'bottom-start',
                'bottom',
                'bottom-end',
                'top-start',
                'top',
                'top-end',
              ],
        }),
        shift({ padding: 8 }), // Keep dropdown within viewport with 8px padding
        size({
          apply({ availableHeight, elements }) {
            // Limit dropdown height based on available space
            Object.assign(elements.floating.style, {
              maxHeight: `${Math.min(256, availableHeight)}px`, // Max 256px or available height
            });
          },
        }),
      ],
      whileElementsMounted: autoUpdate, // Automatically reposition on scroll/resize/drag
    });

    // Set reference element when it changes
    useEffect(() => {
      if (referenceEl) {
        refs.setReference(referenceEl);
      }
    }, [referenceEl, refs]);

    useImperativeHandle(ref, () => ({
      navigateUp: () => {
        // Navigate up logic handled by parent
      },
      navigateDown: () => {
        // Navigate down logic handled by parent
      },
      selectCurrent: () => {
        if (searchResults[selectedIndex]) {
          onSelect(searchResults[selectedIndex]);
        }
      },
    }));

    // Scroll selected item into view
    useEffect(() => {
      if (itemRefs.current[selectedIndex]) {
        itemRefs.current[selectedIndex]?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }, [selectedIndex]);

    if (!isOpen || !referenceEl) return null;

    // Determine if we should reverse the visual order (when dropdown is above)
    const isAbove = placement.startsWith('top');
    const displayResults = isAbove
      ? [...searchResults].reverse()
      : searchResults;
    const displaySelectedIndex = isAbove
      ? searchResults.length - 1 - selectedIndex
      : selectedIndex;

    return (
      <FloatingPortal>
        <div
          ref={(node) => {
            refs.setFloating(node);
            dropdownRef.current = node;
          }}
          className={cn(
            glassyBoxClassName,
            'z-50 flex w-64 flex-col overflow-hidden rounded-xl p-1 shadow-lg shadow-zinc-950/10',
          )}
          style={floatingStyles}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4 text-foreground/60">
              <LoaderIcon className="mr-2 size-4 animate-spin" />
              Searching files...
            </div>
          ) : displayResults.length === 0 ? (
            <div className="p-4 text-center text-foreground/60 text-sm">
              No files found
            </div>
          ) : (
            <div className="scrollbar-thin scrollbar-thumb-black/15 scrollbar-track-transparent flex flex-col overflow-y-auto">
              {displayResults.map((result, displayIndex) => {
                const originalIndex = isAbove
                  ? searchResults.length - 1 - displayIndex
                  : displayIndex;
                // Use getFileIcon to get the appropriate icon and color
                const { Icon, color } = getFileIcon(
                  result.item.filepath.endsWith('/')
                    ? result.item.filepath
                    : result.item.filename,
                );

                return (
                  <div
                    role="button"
                    key={`${result.item.filepath}-${originalIndex}`}
                    ref={(el) => {
                      itemRefs.current[originalIndex] = el;
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150',
                      displaySelectedIndex === displayIndex
                        ? 'bg-blue-500/20 text-blue-600'
                        : 'text-foreground hover:bg-zinc-950/10',
                    )}
                    onClick={() => onSelect(searchResults[originalIndex])}
                    onMouseEnter={() => {
                      // Update selected index on hover if needed
                    }}
                  >
                    <Icon
                      className="size-4 flex-shrink-0 opacity-60"
                      style={{
                        color:
                          displaySelectedIndex === displayIndex
                            ? undefined // Let selection color override
                            : color || undefined,
                      }}
                    />
                    <div className="flex min-w-0 flex-row items-center gap-1">
                      <span className="truncate font-medium">
                        {result.item.filename}
                      </span>
                      {result.item.dirname && result.item.dirname !== '.' && (
                        <span className="truncate text-foreground/60 text-xs">
                          {result.item.dirname}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </FloatingPortal>
    );
  },
);

FileMentionDropdown.displayName = 'FileMentionDropdown';
