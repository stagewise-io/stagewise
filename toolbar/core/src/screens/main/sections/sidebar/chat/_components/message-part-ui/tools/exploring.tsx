import type { ToolPart } from '@stagewise/karton-contract';
import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { GlobToolPart } from './glob';
import { GrepSearchToolPart } from './grep-search';
import { ListFilesToolPart } from './list-files';
import { ReadFileToolPart } from './read-file';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/utils';

export type ReadOnlyToolPart = Extract<
  ToolPart,
  {
    type:
      | 'tool-globTool'
      | 'tool-grepSearchTool'
      | 'tool-listFilesTool'
      | 'tool-readFileTool';
  }
>;

export function isReadOnlyToolPart(part: ToolPart): part is ReadOnlyToolPart {
  return (
    part.type === 'tool-globTool' ||
    part.type === 'tool-grepSearchTool' ||
    part.type === 'tool-listFilesTool' ||
    part.type === 'tool-readFileTool'
  );
}

const PartContent = ({
  part,
  shimmer = false,
}: {
  part: ReadOnlyToolPart;
  shimmer?: boolean;
}) => {
  switch (part.type) {
    case 'tool-globTool':
      return (
        <GlobToolPart key={part.toolCallId} part={part} shimmer={shimmer} />
      );
    case 'tool-grepSearchTool':
      return (
        <GrepSearchToolPart
          key={part.toolCallId}
          part={part}
          shimmer={shimmer}
        />
      );
    case 'tool-listFilesTool':
      return (
        <ListFilesToolPart
          key={part.toolCallId}
          part={part}
          shimmer={shimmer}
        />
      );
    case 'tool-readFileTool':
      return (
        <ReadFileToolPart key={part.toolCallId} part={part} shimmer={shimmer} />
      );
    default:
      return null;
  }
};

export const ExploringToolParts = ({
  parts,
}: {
  parts: ReadOnlyToolPart[];
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [containerReady, setContainerReady] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const isUserScrolledRef = useRef(false);
  const isOnlyOnePart = useMemo(() => parts.length === 1, [parts]);
  const partContents = useMemo(() => {
    return parts.map((part) => (
      <PartContent key={part.toolCallId} part={part} />
    ));
  }, [parts]);

  const isStreaming = useMemo(
    () =>
      parts.some(
        (part) =>
          part.state === 'input-streaming' || part.state === 'input-available',
      ),
    [parts],
  );

  useEffect(() => {
    if (!isStreaming) setIsExpanded(false);
  }, [isStreaming]);

  const explorationMetadata = useMemo(() => {
    let filesRead = 0;
    let filesFound = 0;
    let linesRead = 0;

    const finishedParts = parts.filter(
      (part) => part.state === 'output-available',
    );
    finishedParts.forEach((part) => {
      switch (part.type) {
        case 'tool-readFileTool':
          filesRead += 1;
          linesRead += part.output?.result?.totalLines ?? 0;
          break;
        case 'tool-globTool':
        case 'tool-grepSearchTool':
          filesFound += part.output?.result?.totalMatches ?? 0;
          break;
        case 'tool-listFilesTool':
          filesFound += part.output?.result?.totalFiles ?? 0;
          break;
      }
    });
    return { filesRead, filesFound, linesRead };
  }, [parts]);

  const totalFilesExplored = useMemo(
    () => explorationMetadata.filesRead + explorationMetadata.filesFound,
    [explorationMetadata],
  );

  const explorationFinishedText = useMemo(() => {
    if (totalFilesExplored === 0) return 'Explored directory';
    if (totalFilesExplored > 50) return 'Explored directory';
    if (totalFilesExplored === 1) return 'Explored 1 file';
    return `Explored ${totalFilesExplored} files`;
  }, [totalFilesExplored]);

  // Find the scrollable container element (the CollapsibleContent with overflow-y-auto)
  const findScrollContainer = (
    element: HTMLElement | null,
  ): HTMLElement | null => {
    if (!element) return null;
    const style = window.getComputedStyle(element);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return element;
    }
    return findScrollContainer(element.parentElement);
  };

  // Callback ref to find scroll container when wrapper mounts
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const setContentWrapperRef = (element: HTMLDivElement | null) => {
    contentWrapperRef.current = element;
    if (element) {
      const container = findScrollContainer(element);
      if (container) {
        scrollContainerRef.current = container;
        setContainerReady(true);
      } else {
        setContainerReady(false);
      }
    } else {
      setContainerReady(false);
    }
  };

  // Check if user is at bottom of scroll container
  const isAtBottom = (element: HTMLElement): boolean => {
    const threshold = 10;
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  };

  // Track user scroll position and reset when expanded
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isExpanded || !containerReady) return;

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight;
        isUserScrolledRef.current = false;
      }
    });

    const handleScroll = () => {
      isUserScrolledRef.current = !isAtBottom(container);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [isExpanded, containerReady]);

  // Auto-scroll to bottom when parts change (if user hasn't scrolled away)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isExpanded || !containerReady) return;

    const shouldAutoScroll = !isUserScrolledRef.current;

    if (shouldAutoScroll) {
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [parts, isExpanded, containerReady]);

  return (
    <div className="group/exploring-part -mx-1 block min-w-32 rounded-xl border-border/20 bg-muted-foreground/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger
          size="condensed"
          className={`h-6 gap-1 rounded-xl px-2.5 text-muted-foreground ${isOnlyOnePart ? '' : 'cursor-pointer'}`}
        >
          {isOnlyOnePart ? (
            <PartContent part={parts[0]!} shimmer />
          ) : (
            <div
              className={cn(
                `flex w-full flex-row items-center justify-between gap-1 text-xs`,
              )}
            >
              {isStreaming ? (
                <span className="shimmer-text shimmer-duration-1500 shimmer-from-muted-foreground shimmer-to-zinc-50">
                  Exploring...
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {explorationFinishedText}
                </span>
              )}
              <ChevronDownIcon
                className={cn(
                  'size-3 transition-transform duration-150',
                  isExpanded && 'rotate-180',
                )}
              />
            </div>
          )}
        </CollapsibleTrigger>
        {!isOnlyOnePart && (
          <CollapsibleContent className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px)] scrollbar-hover-only block max-h-24 overflow-y-auto overscroll-y-none pb-0.5">
            <div
              ref={setContentWrapperRef}
              className="flex flex-col gap-1.5 pb-1"
            >
              {partContents}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
};
