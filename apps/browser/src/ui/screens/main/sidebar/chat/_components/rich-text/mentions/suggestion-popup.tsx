import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react';
import { cn } from '@ui/utils';
import { SuggestionPopupContainer, SuggestionSidePanel } from '../shared';
import type { TabState, MountEntry } from '@shared/karton-contracts/ui';
import { inferMimeType } from '@shared/mime-utils';
import {
  getFilePreviewForFile,
  type FilePreviewProps,
} from '@ui/components/file-preview';
import type {
  ResolvedMentionItem,
  TabMentionItem,
  FileMentionItem,
  WorkspaceMentionItem,
} from './types';
import { MentionIcon } from './mention-icon';
import { FilePathTree } from './file-path-tree';
import { WorkspacePreviewSummary } from './workspace-preview-summary';
import { getBaseName } from '@shared/path-utils';

type SidePanelContent =
  | {
      type: 'tab';
      key: string;
      screenshot: string;
      title?: string;
      url?: string;
    }
  | {
      type: 'file';
      key: string;
      src: string;
      fileName: string;
      relativePath: string;
      mediaType: string;
      Preview: FC<FilePreviewProps>;
    }
  | {
      type: 'file-path';
      key: string;
      workspaceName: string;
      relativePath: string;
      fileName: string;
    }
  | {
      type: 'workspace';
      key: string;
      mount: MountEntry;
      name: string;
    };

function deriveSidePanel(
  item: ResolvedMentionItem | undefined,
  tabs: Record<string, TabState>,
  mounts: MountEntry[],
): SidePanelContent | null {
  if (!item) return null;

  if (item.providerType === 'tab') {
    const meta = (item as TabMentionItem).meta;
    const tabState = tabs[meta.tabId];
    const screenshot = tabState?.screenshot;
    if (!screenshot) return null;
    return {
      type: 'tab',
      key: `tab:${meta.tabId}`,
      screenshot,
      title: tabState.title,
      url: tabState.url,
    };
  }

  if (item.providerType === 'file') {
    const meta = (item as FileMentionItem).meta;
    const mount = mounts.find((m) => m.prefix === meta.mountPrefix);
    const workspaceName = mount
      ? getBaseName(mount.path) || mount.path
      : meta.mountPrefix;

    if (meta.isDirectory) {
      return {
        type: 'file-path',
        key: `file-path:${meta.mountedPath}`,
        workspaceName,
        relativePath: meta.relativePath,
        fileName: meta.fileName,
      };
    }

    const entry = getFilePreviewForFile(meta.fileName);
    const mime = inferMimeType(meta.fileName);

    if (!entry.variants.expanded || entry.id === 'video') {
      // Code files / unsupported previews → show path tree
      return {
        type: 'file-path',
        key: `file-path:${meta.mountedPath}`,
        workspaceName,
        relativePath: meta.relativePath,
        fileName: meta.fileName,
      };
    }

    const src = `workspace://${meta.mountPrefix}/${encodeURIComponent(meta.relativePath)}`;
    return {
      type: 'file',
      key: `file:${meta.mountedPath}`,
      src,
      fileName: meta.fileName,
      relativePath: meta.relativePath,
      mediaType: mime,
      Preview: entry.variants.compact,
    };
  }

  if (item.providerType === 'workspace') {
    const meta = (item as WorkspaceMentionItem).meta;
    const mount = mounts.find((m) => m.prefix === meta.prefix);
    if (!mount) return null;
    return {
      type: 'workspace',
      key: `workspace:${meta.prefix}`,
      mount,
      name: meta.name,
    };
  }

  return null;
}

interface SuggestionPopupProps {
  items: ResolvedMentionItem[];
  selectedIndex: number;
  selectionSource: 'keyboard' | 'mouse';
  onSelect: (item: ResolvedMentionItem) => void;
  onHoverIndex: (index: number) => void;
  onMouseMoved: () => void;
  clientRect: (() => DOMRect | null) | null;
  tabs: Record<string, TabState>;
  mounts: MountEntry[];
}

function SuggestionItem({
  item,
  isSelected,
  onSelect,
  onMouseEnter,
  onRef,
}: {
  item: ResolvedMentionItem;
  isSelected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={onRef}
      type="button"
      className={cn(
        'flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none transition-colors duration-150 ease-out',
        isSelected ? 'bg-surface-1 text-foreground' : 'text-foreground',
      )}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => e.preventDefault()}
    >
      <MentionIcon
        providerType={item.providerType}
        id={item.id}
        className="size-3 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 shrink-0">{item.label}</span>
      {item.description && (
        <span
          className="min-w-0 truncate text-subtle-foreground text-xs"
          dir={item.descriptionTruncation === 'start' ? 'rtl' : undefined}
        >
          {item.descriptionTruncation === 'start' ? (
            <span dir="ltr">{item.description}</span>
          ) : (
            item.description
          )}
        </span>
      )}
    </button>
  );
}

export function SuggestionPopup({
  items,
  selectedIndex,
  selectionSource,
  onSelect,
  onHoverIndex,
  onMouseMoved,
  clientRect,
  tabs,
  mounts,
}: SuggestionPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

  useEffect(() => {
    if (selectionSource !== 'keyboard') return;
    const el = itemRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, selectionSource]);

  const selectedItem = items[selectedIndex] as ResolvedMentionItem | undefined;
  const sidePanel = useMemo(
    () => deriveSidePanel(selectedItem, tabs, mounts),
    [selectedItem, tabs, mounts],
  );

  useLayoutEffect(() => {
    const itemEl = itemRefs.current.get(selectedIndex);
    const container = containerRef.current;
    const panel = sidePanelRef.current;
    if (!itemEl || !container || !panel) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();
    const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

    const panelHeight = panel.offsetHeight;
    const containerHeight = container.offsetHeight;

    let offset = centerY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setSidePanelOffset(offset);
  }, [selectedIndex, sidePanel]);

  if (items.length === 0) {
    return (
      <SuggestionPopupContainer clientRect={clientRect} ref={containerRef}>
        <div className="px-2 py-1 text-muted-foreground text-xs">
          No results
        </div>
      </SuggestionPopupContainer>
    );
  }

  return (
    <SuggestionPopupContainer
      clientRect={clientRect}
      ref={containerRef}
      onMouseMove={onMouseMoved}
      sidePanel={
        sidePanel ? (
          <SuggestionSidePanel ref={sidePanelRef} offset={sidePanelOffset}>
            {sidePanel.type === 'tab' ? (
              <TabPreviewContent
                screenshot={sidePanel.screenshot}
                title={sidePanel.title}
                url={sidePanel.url}
              />
            ) : sidePanel.type === 'file' ? (
              <FilePreviewContent
                src={sidePanel.src}
                fileName={sidePanel.fileName}
                relativePath={sidePanel.relativePath}
                mediaType={sidePanel.mediaType}
                Preview={sidePanel.Preview}
              />
            ) : sidePanel.type === 'file-path' ? (
              <FilePathTree
                workspaceName={sidePanel.workspaceName}
                relativePath={sidePanel.relativePath}
                fileName={sidePanel.fileName}
              />
            ) : (
              <WorkspacePreviewSummary
                mount={sidePanel.mount}
                name={sidePanel.name}
              />
            )}
          </SuggestionSidePanel>
        ) : null
      }
    >
      {items.map((item, idx) => (
        <SuggestionItem
          key={`${item.providerType}:${item.id}`}
          item={item}
          isSelected={idx === selectedIndex}
          onSelect={() => onSelect(item)}
          onMouseEnter={() => onHoverIndex(idx)}
          onRef={(el) => {
            itemRefs.current.set(idx, el);
          }}
        />
      ))}
    </SuggestionPopupContainer>
  );
}

function TabPreviewContent({
  screenshot,
  title,
  url,
}: {
  screenshot: string;
  title?: string;
  url?: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [screenshot]);

  return (
    <>
      <img
        src={screenshot}
        className="hidden"
        alt=""
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageLoaded(false)}
      />
      {imageLoaded && (
        <div className="flex min-h-20 w-full items-center justify-center overflow-hidden rounded-sm bg-background ring-1 ring-border-subtle">
          <img
            src={screenshot}
            className="max-h-32 max-w-full object-contain"
            alt="Tab preview"
          />
        </div>
      )}
      {title && (
        <span className="truncate font-medium text-foreground text-xs">
          {title}
        </span>
      )}
      {url && (
        <span className="truncate text-[10px] text-subtle-foreground" dir="rtl">
          <span dir="ltr">{url}</span>
        </span>
      )}
    </>
  );
}

function FilePreviewContent({
  src,
  fileName,
  relativePath,
  mediaType,
  Preview,
}: {
  src: string;
  fileName: string;
  relativePath: string;
  mediaType: string;
  Preview: FC<FilePreviewProps>;
}) {
  return (
    <>
      <Preview
        src={src}
        fileName={fileName}
        mediaType={mediaType}
        className="max-h-32"
      />
      <span className="truncate font-medium text-foreground text-xs">
        {fileName}
      </span>
      <span className="truncate text-[10px] text-subtle-foreground" dir="rtl">
        <span dir="ltr">{relativePath}</span>
      </span>
    </>
  );
}
