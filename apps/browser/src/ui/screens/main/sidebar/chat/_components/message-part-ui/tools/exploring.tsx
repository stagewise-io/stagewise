import { useKartonState } from '@ui/hooks/use-karton';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
} from 'react';
import type { ReasoningUIPart } from 'ai';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { GlobToolPart } from './glob';
import { SearchIcon } from 'lucide-react';
import { GrepSearchToolPart } from './grep-search';
import { ListFilesToolPart } from './list-files';
import { ReadFileToolPart } from './read-file';
import { UpdateWorkspaceMdToolPart } from './update-workspace-md';
import { SearchInLibraryDocsToolPart } from './search-in-library-docs';
import { ListLibraryDocsToolPart } from './list-library-docs';
import { cn } from '@ui/utils';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { ToolPartUI } from './shared/tool-part-ui';
import { ThinkingPart } from '../thinking';
import { ReadConsoleLogsToolPart } from './read-console-logs';
import { ExecuteSandboxJsToolPart } from './execute-sandbox-js';
import { GetLintingDiagnosticsToolPart } from './get-linting-diagnostics';
import {
  getSandboxLabel,
  parseCDPCalls,
  parseWriteFileCalls,
  parseReadAttachmentCalls,
  parseOutputAttachmentCalls,
  resolveTabHostname,
  getAttachmentLabel,
} from './utils/sandbox-label-utils';

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
      AgentToolUIPart,
      {
        type:
          | 'tool-globTool'
          | 'tool-grepSearchTool'
          | 'tool-listFilesTool'
          | 'tool-readFileTool'
          | 'tool-searchInLibraryDocsTool'
          | 'tool-listLibraryDocsTool'
          | 'tool-executeSandboxJsTool'
          | 'tool-readConsoleLogsTool'
          | 'tool-getLintingDiagnosticsTool'
          | 'tool-updateWorkspaceMdTool';
      }
    >
  | ReasoningUIPart;

export function isReadOnlyToolPart(
  part: AgentToolUIPart | ReasoningUIPart,
): part is ReadOnlyToolPart {
  return (
    part.type === 'reasoning' ||
    part.type === 'tool-globTool' ||
    part.type === 'tool-grepSearchTool' ||
    part.type === 'tool-listFilesTool' ||
    part.type === 'tool-readFileTool' ||
    part.type === 'tool-searchInLibraryDocsTool' ||
    part.type === 'tool-listLibraryDocsTool' ||
    part.type === 'tool-executeSandboxJsTool' ||
    part.type === 'tool-readConsoleLogsTool' ||
    part.type === 'tool-getLintingDiagnosticsTool' ||
    part.type === 'tool-updateWorkspaceMdTool'
  );
}

const PartContent = ({
  part,
  minimal = false,
  disableShimmer = false,
  thinkingDuration,
  isLastPart = false,
  capMaxHeight = false,
}: {
  part: ReadOnlyToolPart;
  minimal?: boolean;
  disableShimmer?: boolean;
  thinkingDuration?: number;
  isLastPart?: boolean;
  capMaxHeight?: boolean;
}) => {
  switch (part.type) {
    case 'reasoning':
      return (
        <ThinkingPart
          part={part}
          isShimmering={!disableShimmer}
          thinkingDuration={thinkingDuration}
          isLastPart={isLastPart}
          capMaxHeight={capMaxHeight}
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
    case 'tool-searchInLibraryDocsTool':
      return (
        <SearchInLibraryDocsToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-listLibraryDocsTool':
      return (
        <ListLibraryDocsToolPart
          key={part.toolCallId}
          minimal={minimal}
          part={part}
          disableShimmer={disableShimmer}
        />
      );
    case 'tool-executeSandboxJsTool':
      return (
        <ExecuteSandboxJsToolPart
          key={part.toolCallId}
          showBorder={!minimal}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
          capMaxHeight={capMaxHeight}
        />
      );
    case 'tool-readConsoleLogsTool':
      return (
        <ReadConsoleLogsToolPart
          key={part.toolCallId}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
          capMaxHeight={capMaxHeight}
        />
      );
    case 'tool-getLintingDiagnosticsTool':
      return (
        <GetLintingDiagnosticsToolPart
          key={part.toolCallId}
          part={part}
          disableShimmer={disableShimmer}
          isLastPart={isLastPart}
          capMaxHeight={capMaxHeight}
        />
      );
    case 'tool-updateWorkspaceMdTool':
      return (
        <UpdateWorkspaceMdToolPart
          key={part.toolCallId}
          part={part}
          disableShimmer={disableShimmer}
          minimal={minimal}
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
  partsMetadata,
  originalIndices,
}: {
  parts: ReadOnlyToolPart[];
  isAutoExpanded: boolean;
  isShimmering: boolean;
  partsMetadata: UserMessageMetadata['partsMetadata'];
  /** Original indices in msg.parts for each part, used for correct metadata lookup */
  originalIndices: number[];
}) => {
  const [expanded, setExpanded] = useState(isAutoExpanded);
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(
    new Set(),
  );
  const isOnlyOnePart = useMemo(() => parts.length === 1, [parts]);
  const activeTabs = useKartonState((s) => s.browser.tabs);

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
    return parts.map((part, index) => {
      // Use a stable key for reasoning parts (index-based) instead of part.text which changes during streaming
      const stableKey =
        part.type === 'reasoning' ? `reasoning-${index}` : part.toolCallId;
      const isLastPart = index === parts.length - 1;
      // Use the original index from msg.parts to look up the correct metadata
      const originalIndex = originalIndices[index];
      return (
        <PartContent
          key={stableKey}
          part={part}
          minimal={true}
          disableShimmer
          isLastPart={isLastPart}
          thinkingDuration={
            part.type === 'reasoning' && originalIndex !== undefined
              ? (partsMetadata?.[originalIndex]?.endedAt?.getTime() ?? 0) -
                (partsMetadata?.[originalIndex]?.startedAt?.getTime() ?? 0)
              : undefined
          }
        />
      );
    });
  }, [parts, partsMetadata, originalIndices]);

  const explorationMetadata = useMemo(() => {
    let filesRead = 0;
    let filesFound = 0;
    let linesRead = 0;
    let docsRead = 0;
    let consoleLogsRead = 0;
    let hasUsedContext7Tools = false;
    let hasUsedFileTools = false;
    let lintingErrors = 0;
    let lintingWarnings = 0;
    let hasCheckedLinting = false;

    let screenshotsTaken = 0;
    let stylesInspected = 0;
    let domInspected = 0;
    let sandboxScriptsRun = 0;
    let sandboxFilesWritten = 0;
    const attachmentLabels: string[] = [];
    const inspectedHostnames = new Set<string>();

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
        case 'tool-searchInLibraryDocsTool':
          docsRead += 1;
          hasUsedContext7Tools = true;
          break;
        case 'tool-executeSandboxJsTool': {
          const script = part.input?.script ?? '';
          const cdpCalls = parseCDPCalls(script);
          const writeFileCalls = parseWriteFileCalls(script);
          const readAttCalls = parseReadAttachmentCalls(script);
          const multimodalCalls = parseOutputAttachmentCalls(script);

          if (multimodalCalls.length > 0) {
            const customAtts = (part.output as any)?._customFileAttachments as
              | { mediaType?: string }[]
              | undefined;
            if (Array.isArray(customAtts))
              for (const att of customAtts)
                attachmentLabels.push(getAttachmentLabel(att.mediaType));
            else
              for (const call of multimodalCalls)
                attachmentLabels.push(getAttachmentLabel(call.mediaType));
          } else {
            const customAtts = (part.output as any)?._customFileAttachments as
              | { mediaType?: string }[]
              | undefined;
            if (Array.isArray(customAtts))
              for (const att of customAtts)
                attachmentLabels.push(getAttachmentLabel(att.mediaType));
          }

          if (readAttCalls.length > 0)
            for (let i = 0; i < readAttCalls.length; i++)
              attachmentLabels.push('attachment');

          const realWrites = writeFileCalls.filter(
            (c) => !c.relativePath.startsWith('att/'),
          );
          sandboxFilesWritten += realWrites.length;

          if (cdpCalls.length > 0) {
            for (const call of cdpCalls) {
              const hostname = resolveTabHostname(call.tabId, activeTabs);
              if (hostname) inspectedHostnames.add(hostname);

              if (call.method === 'Page.captureScreenshot') screenshotsTaken++;
              else if (
                call.method.startsWith('CSS.') &&
                call.method !== 'CSS.enable'
              )
                stylesInspected++;
              else if (
                call.method.startsWith('DOM.') &&
                call.method !== 'DOM.enable'
              )
                domInspected++;
            }
          } else sandboxScriptsRun++;

          break;
        }
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

    const hasUsedBrowserTools =
      screenshotsTaken > 0 ||
      stylesInspected > 0 ||
      domInspected > 0 ||
      sandboxScriptsRun > 0 ||
      sandboxFilesWritten > 0 ||
      consoleLogsRead > 0;

    return {
      filesRead,
      filesFound,
      linesRead,
      docsRead,
      consoleLogsRead,
      hasUsedBrowserTools,
      hasUsedContext7Tools,
      hasUsedFileTools,
      lintingErrors,
      lintingWarnings,
      hasCheckedLinting,
      screenshotsTaken,
      stylesInspected,
      domInspected,
      sandboxScriptsRun,
      sandboxFilesWritten,
      attachmentLabels,
      inspectedHostnames,
    };
  }, [parts, activeTabs]);

  const isReasoningOnly = useMemo(
    () => parts.every((p) => p.type === 'reasoning'),
    [parts],
  );

  const explorationFinishedText = useMemo(() => {
    if (isReasoningOnly) return 'Thought';

    const {
      filesFound,
      filesRead,
      docsRead,
      consoleLogsRead,
      hasUsedBrowserTools,
      hasUsedContext7Tools,
      hasUsedFileTools,
      lintingErrors,
      lintingWarnings,
      hasCheckedLinting,
      screenshotsTaken,
      stylesInspected,
      domInspected,
      sandboxScriptsRun,
      sandboxFilesWritten,
      attachmentLabels,
      inspectedHostnames,
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

    // Sandbox: build a descriptive browser segment
    const hostSuffix =
      inspectedHostnames.size === 1
        ? ` on ${Array.from(inspectedHostnames)[0]}`
        : inspectedHostnames.size > 1
          ? ` on ${inspectedHostnames.size} tabs`
          : '';

    if (screenshotsTaken > 0)
      textParts.push(
        `${screenshotsTaken} screenshot${screenshotsTaken !== 1 ? 's' : ''}${hostSuffix}`,
      );

    if (stylesInspected > 0) textParts.push(`styles${hostSuffix}`);

    if (domInspected > 0 && stylesInspected === 0)
      textParts.push(`DOM${hostSuffix}`);

    if (
      sandboxScriptsRun > 0 &&
      screenshotsTaken === 0 &&
      stylesInspected === 0 &&
      domInspected === 0
    )
      textParts.push(
        `${sandboxScriptsRun} script${sandboxScriptsRun !== 1 ? 's' : ''}${hostSuffix}`,
      );

    if (sandboxFilesWritten > 0)
      textParts.push(
        `${sandboxFilesWritten} sandbox file${sandboxFilesWritten !== 1 ? 's' : ''}`,
      );

    if (attachmentLabels.length > 0) {
      const allSame = attachmentLabels.every((l) => l === attachmentLabels[0]);
      const noun = allSame ? attachmentLabels[0] : 'attachment';
      textParts.push(
        attachmentLabels.length === 1
          ? `1 ${noun}`
          : `${attachmentLabels.length} ${noun}s`,
      );
    }

    const hasExploredFiles = filesFound > 0 || filesRead > 0;

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
      if (hasUsedBrowserTools) textParts.push('the browser');
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
  }, [explorationMetadata, isReasoningOnly]);

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
      case 'tool-searchInLibraryDocsTool': {
        const p = lastNonReasoningPart as Extract<
          AgentToolUIPart,
          { type: 'tool-searchInLibraryDocsTool' }
        >;
        if (!p.input?.libraryId) return 'Exploring documentation...';
        return `Reading docs for ${p.input.libraryId}...`;
      }
      case 'tool-listLibraryDocsTool': {
        const p = lastNonReasoningPart as Extract<
          AgentToolUIPart,
          { type: 'tool-listLibraryDocsTool' }
        >;
        if (!p.input?.name) return 'Exploring documentation...';
        return `Searching docs for ${p.input.name}...`;
      }
      case 'tool-executeSandboxJsTool': {
        const p = lastNonReasoningPart as Extract<
          AgentToolUIPart,
          { type: 'tool-executeSandboxJsTool' }
        >;
        return getSandboxLabel(p.input?.script, activeTabs, true);
      }
      case 'tool-readConsoleLogsTool': {
        const p = lastNonReasoningPart as Extract<
          AgentToolUIPart,
          { type: 'tool-readConsoleLogsTool' }
        >;
        const tab = activeTabs[p.input?.id ?? ''];
        if (!tab) return 'Exploring the browser...';
        const hostname = new URL(tab.url).hostname;
        return `Reading logs from ${hostname}...`;
      }
      case 'tool-getLintingDiagnosticsTool':
        return 'Checking linting...';
      default:
        return isReasoningOnly ? 'Thinking...' : 'Exploring...';
    }
  }, [parts, activeTabs, isReasoningOnly]);

  // True when at least one tool part is still actively streaming/executing
  const anyPartStreaming = useMemo(
    () =>
      parts.some(
        (p) =>
          p.type !== 'reasoning' &&
          p.state !== 'output-available' &&
          p.state !== 'output-error',
      ),
    [parts],
  );

  const headerText =
    anyPartStreaming || isShimmering
      ? explorationInProgressText
      : explorationFinishedText;

  const headerRef = useRef<HTMLSpanElement>(null);
  const { isTruncated, tooltipOpen, setTooltipOpen } =
    useIsTruncated(headerRef);

  // For single part, show it inline without the exploring wrapper — unless
  // the part is settled and we're still shimmering, in which case fall
  // through to the multi-part path whose header can shimmer independently.
  if (
    isOnlyOnePart &&
    (parts[0]?.type === 'reasoning' || anyPartStreaming || !isShimmering)
  ) {
    // Use the original index from msg.parts to look up the correct metadata
    const originalIndex = originalIndices[0];
    return (
      <PartContent
        part={parts[0]!}
        minimal={true}
        disableShimmer={!isShimmering}
        thinkingDuration={
          originalIndex !== undefined
            ? (partsMetadata?.[originalIndex]?.endedAt?.getTime() ?? 0) -
              (partsMetadata?.[originalIndex]?.startedAt?.getTime() ?? 0)
            : undefined
        }
        isLastPart={isAutoExpanded}
        capMaxHeight={true}
      />
    );
  }

  // For multiple parts, use MinimalToolPartUI with collapsible content
  return (
    <ToolPartUI
      expanded={expanded}
      setExpanded={setExpanded}
      isShimmering={isShimmering}
      autoScroll={isShimmering}
      trigger={
        <div className={cn(`flex flex-row items-center justify-start gap-2`)}>
          <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-1 text-xs">
            <SearchIcon
              className={cn(
                'size-3 shrink-0',
                isShimmering && 'text-primary-foreground',
              )}
            />
            <Tooltip
              open={isTruncated && tooltipOpen}
              onOpenChange={setTooltipOpen}
            >
              <TooltipTrigger delay={50}>
                <span
                  ref={headerRef}
                  className={cn(
                    'min-w-0 truncate',
                    isShimmering && 'shimmer-text-primary',
                  )}
                >
                  {headerText}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <div className="max-w-xs break-all">{headerText}</div>
              </TooltipContent>
            </Tooltip>
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
      contentClassName={hasExpandedChild ? 'max-h-96!' : 'max-h-60!'}
    />
  );
};
