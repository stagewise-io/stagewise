import type { ToolPart } from '@stagewise/karton-contract';
import { useMemo, useState, useEffect } from 'react';
import { GlobToolPart } from './glob';
import { SearchIcon } from 'lucide-react';
import { GrepSearchToolPart } from './grep-search';
import { ListFilesToolPart } from './list-files';
import { ReadFileToolPart } from './read-file';
import { cn } from '@/utils';
import { ToolPartUI } from './shared/tool-part-ui';

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
  minimal = false,
  disableShimmer = false,
}: {
  part: ReadOnlyToolPart;
  minimal?: boolean;
  disableShimmer?: boolean;
}) => {
  switch (part.type) {
    case 'tool-globTool':
      return (
        <GlobToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-grepSearchTool':
      return (
        <GrepSearchToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-listFilesTool':
      return (
        <ListFilesToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-readFileTool':
      return (
        <ReadFileToolPart
          minimal={minimal}
          key={part.toolCallId}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    default:
      return null;
  }
};

export const ExploringToolParts = ({
  parts,
  isAutoExpanded,
  isShimmering,
}: {
  parts: ReadOnlyToolPart[];
  isAutoExpanded: boolean;
  isShimmering: boolean;
}) => {
  const [expanded, setExpanded] = useState(isAutoExpanded);
  const isOnlyOnePart = useMemo(() => parts.length === 1, [parts]);

  useEffect(() => {
    setExpanded(isAutoExpanded);
  }, [isAutoExpanded]);

  const partContents = useMemo(() => {
    return parts.map((part) => (
      <PartContent
        key={part.toolCallId}
        part={part}
        minimal={true}
        disableShimmer
      />
    ));
  }, [parts]);

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

  const explorationFinishedText = useMemo(() => {
    const { filesFound, filesRead } = explorationMetadata;

    if (filesFound === 0 && filesRead === 0) {
      return 'Explored directory';
    }

    const parts: string[] = [];
    if (filesFound > 0) {
      parts.push(`Found ${filesFound} file${filesFound !== 1 ? 's' : ''}`);
    }
    if (filesRead > 0) {
      parts.push(`Read ${filesRead} file${filesRead !== 1 ? 's' : ''}`);
    }
    return parts.join(', ');
  }, [explorationMetadata]);

  // For single part, show it inline in the trigger without expand/collapse
  if (isOnlyOnePart)
    return (
      <PartContent
        part={parts[0]!}
        minimal={false}
        disableShimmer={!isShimmering}
      />
    );

  // For multiple parts, use MinimalToolPartUI with collapsible content
  return (
    <ToolPartUI
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={
        <div
          className={cn(
            `flex w-full flex-row items-center justify-start gap-2`,
          )}
        >
          <div className="flex flex-1 flex-row items-center justify-start gap-1 text-xs">
            {isShimmering ? (
              <>
                <SearchIcon className="size-3 shrink-0 text-primary" />
                <span className="shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300 truncate">
                  Exploring...
                </span>
              </>
            ) : (
              <>
                <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  {explorationFinishedText}
                </span>
              </>
            )}
          </div>
        </div>
      }
      content={<div className="flex flex-col gap-1 pb-1">{partContents}</div>}
      contentClassName="max-h-24"
    />
  );
};
