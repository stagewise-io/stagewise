import { createFileRoute } from '@tanstack/react-router';
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type FC,
} from 'react';
import {
  Loader2Icon,
  ChevronDownIcon,
  CheckIcon,
  XIcon,
  ListChevronsUpDownIcon,
  ListChevronsDownUpIcon,
} from 'lucide-react';
import {
  useKartonProcedure,
  useKartonConnected,
  useKartonState,
} from '@pages/hooks/use-karton';
import { DiffPreview } from '@ui/screens/main/agent-chat/chat/_components/message-part-ui/tools/shared/diff-preview';
import { FileIcon } from '@ui/components/file-icon';
import type { FileDiff } from '@shared/karton-contracts/ui/shared-types';
import {
  type FormattedFileDiff,
  getLineStats,
} from '@ui/screens/main/agent-chat/chat/_components/footer-status-card/shared';
import { ExternalFilePreview } from './_components/external-file-preview';
import { getBaseName } from '@shared/path-utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useFileIDEHref } from '@pages/hooks/use-file-ide-href';
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { IdeLogo } from '@ui/components/ide-logo';
import { cn, IDE_SELECTION_ITEMS } from '@ui/utils';

export const Route = createFileRoute('/diff-review/$agentInstanceId')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Diff Preview',
      },
    ],
  }),
});

type FormattedFileDiffWithElementId = FormattedFileDiff & { elementId: string };

const FileDiffItem: FC<{
  edit: FormattedFileDiffWithElementId;
  onAccept: (fileId: string) => void;
  onReject: (fileId: string) => void;
}> = ({ edit, onAccept, onReject }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [collapsedDiffView, setCollapsedDiffView] = useState(true);
  const { added, removed } = getLineStats(edit);
  const {
    getFileIDEHref,
    needsIdePicker,
    pickIdeAndOpen,
    resolvePath,
    toRelativePath,
  } = useFileIDEHref();
  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  return (
    <div
      id={edit.elementId}
      className="overflow-hidden rounded-lg border border-border-subtle bg-background shadow-xs dark:border-border dark:bg-surface-1"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger
          size="condensed"
          render={<div />}
          className="group w-full cursor-pointer p-0 has-[button:hover]:text-muted-foreground"
        >
          {/* File header */}
          <div
            className={`flex h-6 w-full items-center gap-1 bg-background px-2.5 dark:bg-surface-1 ${
              isOpen ? 'border-border/30 border-b dark:border-border/70' : ''
            }`}
          >
            <FileIcon
              filePath={edit.fileName}
              className="-ml-1 size-4 shrink-0"
            />
            <FileContextMenu relativePath={edit.path} resolvePath={resolvePath}>
              <Tooltip>
                <TooltipTrigger>
                  <span className="min-w-0 truncate font-normal text-foreground text-xs hover:text-foreground group-hover:text-hover-derived">
                    {edit.fileName}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-md">
                    {toRelativePath(edit.path) ?? edit.path}
                  </div>
                </TooltipContent>
              </Tooltip>
            </FileContextMenu>
            {edit.isExternal && edit.changeType === 'created' && (
              <span className="shrink-0 text-success-foreground text-xs">
                (new)
              </span>
            )}
            {edit.isExternal && edit.changeType === 'deleted' && (
              <span className="shrink-0 text-error-foreground text-xs">
                (deleted)
              </span>
            )}
            {edit.isExternal && edit.changeType === 'modified' && (
              <span className="shrink-0 text-muted-foreground text-xs">
                (modified)
              </span>
            )}
            {added > 0 && (
              <span className="shrink-0 text-success-foreground text-xs">
                +{added}
              </span>
            )}
            {removed > 0 && (
              <span className="shrink-0 text-error-foreground text-xs">
                -{removed}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="size-6 cursor-pointer p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject(edit.fileId);
                    }}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reject this file</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="size-6 cursor-pointer p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAccept(edit.fileId);
                    }}
                  >
                    <CheckIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Accept this file</TooltipContent>
              </Tooltip>
              <ChevronDownIcon
                className={`size-3 shrink-0 transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="relative">
          {/* Diff content */}
          <div className="mb-6">
            {edit.isExternal ? (
              <ExternalFilePreview fileDiff={edit} />
            ) : (
              <DiffPreview
                diff={edit.lineChanges}
                filePath={edit.path}
                collapsed={collapsedDiffView}
              />
            )}
          </div>
          {/* Footer with collapse toggle and open file button */}
          <div className="absolute right-0 bottom-0 left-0 flex h-6 flex-row items-center justify-between rounded-b-lg border-border/30 border-t bg-background py-1 text-muted-foreground dark:border-border/70 dark:bg-surface-1">
            {!edit.isExternal ? (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setCollapsedDiffView(!collapsedDiffView);
                    }}
                  >
                    {collapsedDiffView ? (
                      <ListChevronsUpDownIcon
                        className={cn('size-3 shrink-0')}
                      />
                    ) : (
                      <ListChevronsDownUpIcon
                        className={cn('size-3 shrink-0')}
                      />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {collapsedDiffView
                    ? 'Expand code diff'
                    : 'Collapse code diff'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div />
            )}
            {!edit.isExternal && <div />}
            {(() => {
              const relPath = edit.path;
              const ideName = IDE_SELECTION_ITEMS[openInIdeSelection];
              const anchor = (
                <a
                  href={needsIdePicker ? '#' : getFileIDEHref(relPath)}
                  target={needsIdePicker ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  onClick={
                    needsIdePicker ? (e) => e.preventDefault() : undefined
                  }
                  className={cn(
                    buttonVariants({ size: 'xs', variant: 'ghost' }),
                    'shrink-0',
                  )}
                >
                  <div className="flex flex-row items-center justify-center gap-1">
                    <IdeLogo
                      ide={openInIdeSelection}
                      className="size-3 shrink-0"
                    />
                    <span className="text-xs">Open file</span>
                  </div>
                </a>
              );
              if (needsIdePicker) {
                return (
                  <IdePickerPopover
                    onSelect={(ide) => pickIdeAndOpen(ide, relPath)}
                  >
                    {anchor}
                  </IdePickerPopover>
                );
              }
              return (
                <Tooltip>
                  <TooltipTrigger>{anchor}</TooltipTrigger>
                  <TooltipContent>
                    <div className="flex max-w-96 flex-col gap-1">
                      <div className="break-all font-mono text-xs">
                        {toRelativePath(relPath) ?? relPath}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Click to open in {ideName}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })()}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

function EmptyContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}

function Page() {
  const { agentInstanceId } = Route.useParams();
  const isConnected = useKartonConnected();
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // Subscribe to real-time state updates for pending edits
  const pendingEditsFromState = useKartonState(
    (s) => s.pendingEditsByAgentInstanceId[agentInstanceId] ?? null,
  );

  // Procedures for fetching and modifying edits
  const getPendingEdits = useKartonProcedure((p) => p.getPendingEdits);
  const acceptAllPendingEdits = useKartonProcedure(
    (p) => p.acceptAllPendingEdits,
  );
  const rejectAllPendingEdits = useKartonProcedure(
    (p) => p.rejectAllPendingEdits,
  );
  const acceptPendingEdit = useKartonProcedure((p) => p.acceptPendingEdit);
  const rejectPendingEdit = useKartonProcedure((p) => p.rejectPendingEdit);

  // Store refs for procedures to avoid stale closures
  const getPendingEditsRef = useRef(getPendingEdits);
  const acceptAllRef = useRef(acceptAllPendingEdits);
  const rejectAllRef = useRef(rejectAllPendingEdits);
  const acceptOneRef = useRef(acceptPendingEdit);
  const rejectOneRef = useRef(rejectPendingEdit);

  useEffect(() => {
    getPendingEditsRef.current = getPendingEdits;
    acceptAllRef.current = acceptAllPendingEdits;
    rejectAllRef.current = rejectAllPendingEdits;
    acceptOneRef.current = acceptPendingEdit;
    rejectOneRef.current = rejectPendingEdit;
  }, [
    getPendingEdits,
    acceptAllPendingEdits,
    rejectAllPendingEdits,
    acceptPendingEdit,
    rejectPendingEdit,
  ]);

  const [pendingEdits, setPendingEdits] = useState<FileDiff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chatFound, setChatFound] = useState(true);

  // Sync state updates to local state
  useEffect(() => {
    if (pendingEditsFromState !== null) {
      setPendingEdits(pendingEditsFromState);
      setIsLoading(false);
      setChatFound(true);
    }
  }, [pendingEditsFromState]);

  // Initial fetch when connected (fallback for first load before state sync)
  useEffect(() => {
    if (!isConnected || !agentInstanceId) return;
    // If we already have state, don't fetch
    if (pendingEditsFromState !== null) return;

    let cancelled = false;

    async function fetchEdits() {
      setIsLoading(true);
      try {
        const result = await getPendingEditsRef.current(agentInstanceId);
        if (!cancelled) {
          setChatFound(result.found);
          setPendingEdits(result.edits);
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch pending edits:', error);
          setChatFound(false);
          setIsLoading(false);
        }
      }
    }

    void fetchEdits();

    return () => {
      cancelled = true;
    };
  }, [isConnected, agentInstanceId, pendingEditsFromState]);

  // Handlers for accept/reject actions
  const handleAcceptAll = useCallback(() => {
    void acceptAllRef.current(agentInstanceId);
  }, [agentInstanceId]);

  const handleRejectAll = useCallback(() => {
    void rejectAllRef.current(agentInstanceId);
  }, [agentInstanceId]);

  const handleAcceptOne = useCallback(
    (fileId: string) => {
      void acceptOneRef.current(agentInstanceId, fileId);
    },
    [agentInstanceId],
  );

  const handleRejectOne = useCallback(
    (fileId: string) => {
      void rejectOneRef.current(agentInstanceId, fileId);
    },
    [agentInstanceId],
  );

  const formattedEdits = useMemo((): FormattedFileDiffWithElementId[] => {
    return pendingEdits.map((edit) => ({
      ...edit,
      fileName: getBaseName(edit.path),
      // Create a stable id for scrolling based on the path
      elementId: `file-${encodeURIComponent(edit.path)}`,
    }));
  }, [pendingEdits]);

  // Scroll to file if hash is present in URL
  useEffect(() => {
    if (isLoading || formattedEdits.length === 0) return;

    const hash = window.location.hash;
    if (!hash) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // Hash format: #<encoded-path>
    const targetPath = decodeURIComponent(hash.slice(1));
    const targetElementId = `file-${encodeURIComponent(targetPath)}`;
    const element = document.getElementById(targetElementId);

    if (element) {
      // Use ResizeObserver to wait for the element to have actual content
      // (CodeBlock uses async Shiki highlighting which renders content later)
      let scrolled = false;
      const scrollToElement = () => {
        if (scrolled) return;
        scrolled = true;

        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop =
          elementRect.top - containerRect.top + scrollContainer.scrollTop;

        scrollContainer.scrollTo({
          top: relativeTop,
          behavior: 'smooth',
        });
      };

      // Watch for size changes on the element (content loading)
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // Once the element has meaningful height, scroll to it
          if (entry.contentRect.height > 50) {
            resizeObserver.disconnect();
            scrollToElement();
          }
        }
      });

      resizeObserver.observe(element);

      // Fallback timeout in case content is already loaded or observer doesn't trigger
      const timeoutId = setTimeout(() => {
        resizeObserver.disconnect();
        scrollToElement();
      }, 500);

      return () => {
        resizeObserver.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [isLoading, formattedEdits]);

  // Loading state while waiting for connection or fetching
  if (!isConnected || isLoading) {
    return (
      <EmptyContainer>
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </EmptyContainer>
    );
  }

  // No chat found
  if (!chatFound) {
    return (
      <EmptyContainer>
        <p className="text-muted-foreground text-sm">Chat not found</p>
      </EmptyContainer>
    );
  }

  // No pending edits
  if (pendingEdits.length === 0) {
    return (
      <EmptyContainer>
        <p className="text-muted-foreground text-sm">No pending changes</p>
      </EmptyContainer>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <h1 className="font-semibold text-foreground text-lg leading-none">
            Diff Preview
          </h1>
          <p className="text-muted-foreground text-sm leading-none">
            {formattedEdits.length} file{formattedEdits.length !== 1 ? 's' : ''}{' '}
            changed
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRejectAll}>
              Reject all
            </Button>
            <Button variant="primary" size="sm" onClick={handleAcceptAll}>
              Accept all
            </Button>
          </div>
        </div>
      </div>

      {/* Content - File diffs */}
      <OverlayScrollbar
        onViewportRef={(el) => {
          scrollContainerRef.current = el;
        }}
        className="flex-1"
        contentClassName="p-6"
      >
        <div className="mx-auto max-w-4xl space-y-6">
          {formattedEdits.map((edit) => (
            <FileDiffItem
              key={edit.fileId}
              edit={edit}
              onAccept={handleAcceptOne}
              onReject={handleRejectOne}
            />
          ))}
        </div>
      </OverlayScrollbar>
    </div>
  );
}
