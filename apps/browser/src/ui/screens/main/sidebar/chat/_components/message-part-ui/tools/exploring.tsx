import type { ToolPart } from '@shared/karton-contracts/ui';
import {
  useMemo,
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from 'react';
import type { ReasoningUIPart } from 'ai';
import { GlobToolPart } from './glob';
import { SearchIcon } from 'lucide-react';
import { GrepSearchToolPart } from './grep-search';
import { ListFilesToolPart } from './list-files';
import { ReadFileToolPart } from './read-file';
import { GetContext7LibraryDocsToolPart } from './get-context7-library-docs';
import { ResolveContext7LibraryToolPart } from './resolve-context7-library';
import { cn } from '@/utils';
import { ToolPartUI } from './shared/tool-part-ui';
import { ThinkingPart } from '../thinking';
import { ReadConsoleLogsToolPart } from './read-console-logs';
import { ExecuteConsoleScriptToolPart } from './execute-console-script';
import { GetLintingDiagnosticsToolPart } from './get-linting-diagnostics';

// Context for tracking expanded children within exploring section
interface ExploringContentContextValue {
  registerExpanded: (id: string) => void;
  unregisterExpanded: (id: string) => void;
}

export const ExploringContentContext =
  createContext<ExploringContentContextValue | null>(null);

export const useExploringContentContext = () => {
  return useContext(ExploringContentContext);
};

export type ReadOnlyToolPart =
  | Extract<
      ToolPart,
      {
        type:
          | 'tool-globTool'
          | 'tool-grepSearchTool'
          | 'tool-listFilesTool'
          | 'tool-readFileTool'
          | 'tool-getContext7LibraryDocsTool'
          | 'tool-resolveContext7LibraryTool'
          | 'tool-executeConsoleScriptTool'
          | 'tool-readConsoleLogsTool'
          | 'tool-getLintingDiagnosticsTool';
      }
    >
  | ReasoningUIPart;

export function isReadOnlyToolPart(
  part: ToolPart | ReasoningUIPart,
): part is ReadOnlyToolPart {
  return (
    part.type === 'reasoning' ||
    part.type === 'tool-globTool' ||
    part.type === 'tool-grepSearchTool' ||
    part.type === 'tool-listFilesTool' ||
    part.type === 'tool-readFileTool' ||
    part.type === 'tool-getContext7LibraryDocsTool' ||
    part.type === 'tool-resolveContext7LibraryTool' ||
    part.type === 'tool-executeConsoleScriptTool' ||
    part.type === 'tool-readConsoleLogsTool' ||
    part.type === 'tool-getLintingDiagnosticsTool'
  );
}

const PartContent = ({
  part,
  minimal = false,
  disableShimmer = false,
  thinkingDuration,
  isLastPart = false,
}: {
  part: ReadOnlyToolPart;
  minimal?: boolean;
  disableShimmer?: boolean;
  thinkingDuration?: number;
  isLastPart?: boolean;
}) => {
  switch (part.type) {
    case 'reasoning':
      return (
        <ThinkingPart
          part={part}
          isShimmering={false}
          thinkingDuration={thinkingDuration}
          showBorder={!minimal}
          isLastPart={isLastPart}
        />
      );
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
    case 'tool-getContext7LibraryDocsTool':
      return (
        <GetContext7LibraryDocsToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-resolveContext7LibraryTool':
      return (
        <ResolveContext7LibraryToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-executeConsoleScriptTool':
      return (
        <ExecuteConsoleScriptToolPart
          key={part.toolCallId}
          showBorder={!minimal}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
        />
      );
    case 'tool-readConsoleLogsTool':
      return (
        <ReadConsoleLogsToolPart
          key={part.toolCallId}
          showBorder={!minimal}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
        />
      );
    case 'tool-getLintingDiagnosticsTool':
      return (
        <GetLintingDiagnosticsToolPart
          key={part.toolCallId}
          showBorder={!minimal}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
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
  thinkingDurations,
}: {
  parts: ReadOnlyToolPart[];
  isAutoExpanded: boolean;
  isShimmering: boolean;
  thinkingDurations?: number[];
}) => {
  const [expanded, setExpanded] = useState(isAutoExpanded);
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(
    new Set(),
  );
  const isOnlyOnePart = useMemo(() => parts.length === 1, [parts]);

  useEffect(() => {
    setExpanded(isAutoExpanded);
  }, [isAutoExpanded]);

  const registerExpanded = useCallback((id: string) => {
    setExpandedChildren((prev) => new Set(prev).add(id));
  }, []);

  const unregisterExpanded = useCallback((id: string) => {
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const contextValue = useMemo(
    () => ({ registerExpanded, unregisterExpanded }),
    [registerExpanded, unregisterExpanded],
  );

  const hasExpandedChild = expandedChildren.size > 0;

  const partContents = useMemo(() => {
    let reasoningIndex = -1;
    return parts.map((part, index) => {
      if (part.type === 'reasoning') reasoningIndex++;
      // Use a stable key for reasoning parts (index-based) instead of part.text which changes during streaming
      const stableKey =
        part.type === 'reasoning'
          ? `reasoning-${reasoningIndex}`
          : part.toolCallId;
      const isLastPart = index === parts.length - 1;
      return (
        <PartContent
          key={stableKey}
          part={part}
          minimal={true}
          disableShimmer
          isLastPart={isLastPart}
          thinkingDuration={
            part.type === 'reasoning'
              ? thinkingDurations?.[reasoningIndex]
              : undefined
          }
        />
      );
    });
  }, [parts, thinkingDurations]);

  const explorationMetadata = useMemo(() => {
    let filesRead = 0;
    let filesFound = 0;
    let linesRead = 0;
    let docsRead = 0;
    let consoleLogsRead = 0;
    let consoleScriptsExecuted = 0;
    let hasUsedBrowserTools = false;
    let hasUsedContext7Tools = false;
    let hasUsedFileTools = false;
    let lintingErrors = 0;
    let lintingWarnings = 0;
    let hasCheckedLinting = false;

    const finishedParts = parts.filter(
      (part) => part.state === 'output-available',
    );
    finishedParts.forEach((part) => {
      switch (part.type) {
        case 'tool-readFileTool':
          filesRead += 1;
          linesRead += part.output?.result?.totalLines ?? 0;
          hasUsedFileTools = true;
          break;
        case 'tool-globTool':
        case 'tool-grepSearchTool':
          filesFound += part.output?.result?.totalMatches ?? 0;
          hasUsedFileTools = true;
          break;
        case 'tool-listFilesTool':
          filesFound += part.output?.result?.totalFiles ?? 0;
          hasUsedFileTools = true;
          break;
        case 'tool-getContext7LibraryDocsTool':
          docsRead += 1;
          hasUsedContext7Tools = true;
          break;
        case 'tool-executeConsoleScriptTool':
          consoleScriptsExecuted += 1;
          hasUsedBrowserTools = true;
          break;
        case 'tool-readConsoleLogsTool':
          consoleLogsRead += 1;
          break;
        case 'tool-getLintingDiagnosticsTool':
          hasCheckedLinting = true;
          lintingErrors += part.output?.summary?.errors ?? 0;
          lintingWarnings += part.output?.summary?.warnings ?? 0;
          break;
      }
    });
    return {
      filesRead,
      filesFound,
      linesRead,
      docsRead,
      consoleLogsRead,
      consoleScriptsExecuted,
      hasUsedBrowserTools,
      hasUsedContext7Tools,
      hasUsedFileTools,
      lintingErrors,
      lintingWarnings,
      hasCheckedLinting,
    };
  }, [parts]);

  const explorationFinishedText = useMemo(() => {
    const {
      filesFound,
      filesRead,
      docsRead,
      consoleLogsRead,
      consoleScriptsExecuted,
      hasUsedBrowserTools,
      hasUsedContext7Tools,
      hasUsedFileTools,
      lintingErrors,
      lintingWarnings,
      hasCheckedLinting,
    } = explorationMetadata;

    const textParts: string[] = [];
    if (filesFound > 0 || filesRead > 0)
      textParts.push(
        `${filesFound + filesRead} file${filesFound + filesRead !== 1 ? 's' : ''}`,
      );

    if (docsRead > 0)
      textParts.push(`${docsRead} doc${docsRead !== 1 ? 's' : ''}`);

    if (consoleLogsRead > 0)
      textParts.push(
        `${consoleLogsRead} console log${consoleLogsRead !== 1 ? 's' : ''}`,
      );

    if (consoleScriptsExecuted > 0)
      textParts.push(
        `${consoleScriptsExecuted} tab${consoleScriptsExecuted !== 1 ? 's' : ''}`,
      );

    const hasExploredFiles = filesFound > 0 || filesRead > 0;

    // Add linting results
    if (hasCheckedLinting)
      if (lintingErrors > 0 || lintingWarnings > 0) {
        const lintParts: string[] = [];
        if (lintingErrors > 0)
          lintParts.push(
            `${lintingErrors} error${lintingErrors !== 1 ? 's' : ''}`,
          );
        if (lintingWarnings > 0)
          lintParts.push(
            `${lintingWarnings} warning${lintingWarnings !== 1 ? 's' : ''}`,
          );
        textParts.push(lintParts.join(', '));
      }

    if (textParts.length === 0) {
      if (hasCheckedLinting && lintingErrors === 0 && lintingWarnings === 0)
        return 'Checked linting - no issues';
      if (hasUsedBrowserTools) textParts.push('the DOM');
      if (hasUsedContext7Tools) textParts.push('documentation');
      if (hasUsedFileTools) textParts.push('files');
    }

    if (
      !hasExploredFiles &&
      hasCheckedLinting &&
      !!lintingErrors &&
      !!lintingWarnings
    )
      return `Found ${textParts.slice(0, -1).join(', ')} and ${textParts.at(-1)}`;
    else if (!hasExploredFiles && hasCheckedLinting)
      return `Found ${textParts.at(-1)}`;

    if (textParts.length === 0) return 'Explored the codebase';
    if (textParts.length === 1) return `Explored ${textParts[0]}`;
    return `Explored ${textParts.slice(0, -1).join(', ')} and ${textParts.at(-1)}`;
  }, [explorationMetadata]);

  const explorationInProgressText = useMemo(() => {
    const lastNonReasoningPart = parts
      .filter((part) => part.type !== 'reasoning')
      .at(-1);
    switch (lastNonReasoningPart?.type || '') {
      case 'tool-readFileTool':
      case 'tool-globTool':
      case 'tool-grepSearchTool':
      case 'tool-listFilesTool':
        return 'Exploring files...';
      case 'tool-getContext7LibraryDocsTool':
      case 'tool-resolveContext7LibraryTool':
        return 'Exploring documentation...';
      case 'tool-executeConsoleScriptTool':
      case 'tool-readConsoleLogsTool':
        return 'Exploring the browser...';
      case 'tool-getLintingDiagnosticsTool':
        return 'Checking linting...';
      default:
        return 'Exploring...';
    }
  }, [parts]);

  // For single part, show it inline in the trigger without expand/collapse
  if (isOnlyOnePart)
    return (
      <PartContent
        part={parts[0]!}
        minimal={false}
        disableShimmer={!isShimmering}
        thinkingDuration={thinkingDurations?.[0]}
        isLastPart={isAutoExpanded}
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
                  {explorationInProgressText}
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
      content={
        <ExploringContentContext.Provider value={contextValue}>
          <div className="flex flex-col gap-1.25 pb-1 opacity-75">
            {partContents}
          </div>
        </ExploringContentContext.Provider>
      }
      contentClassName={hasExpandedChild ? 'max-h-96' : 'max-h-52'}
    />
  );
};
