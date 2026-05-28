import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { FileIcon } from '@ui/components/file-icon';
import { useKartonState } from '@ui/hooks/use-karton';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { getIDEFileUrl } from '@ui/utils';
import { getBaseName } from '@shared/path-utils';
import type {
  AppState,
  WorkspaceGitSetupRun,
} from '@shared/karton-contracts/ui';
import { IconTriangleWarningOutline18 } from 'nucleo-ui-outline-18';
import { Loader2Icon } from 'lucide-react';

function formatSetupDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatSetupTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function WorkspaceSetupStatusIndicator({
  setupRun,
  failedClassName = 'text-foreground',
}: {
  setupRun?: WorkspaceGitSetupRun;
  failedClassName?: string;
}) {
  if (!setupRun) return null;

  if (setupRun.status === 'running') {
    return (
      <>
        <Loader2Icon
          aria-hidden
          className="size-3 shrink-0 animate-spin text-muted-foreground"
        />
        <span role="status" aria-live="polite" className="sr-only">
          Setup running
        </span>
      </>
    );
  }

  if (setupRun.status === 'failed') {
    return (
      <>
        <IconTriangleWarningOutline18
          aria-hidden
          className={cn('size-3 shrink-0', failedClassName)}
        />
        <span role="status" aria-live="polite" className="sr-only">
          Setup failed
        </span>
      </>
    );
  }

  return null;
}

export function SetupRunSidePanel({
  setupRun,
}: {
  setupRun: WorkspaceGitSetupRun;
}) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const scrollViewportRef = useMemo(
    () => ({ current: scrollViewport }),
    [scrollViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  useEffect(() => {
    if (setupRun.status !== 'running') return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [setupRun.status]);

  const finishedAt = setupRun.finishedAt ?? now;
  const duration = formatSetupDuration(finishedAt - setupRun.startedAt);
  const title =
    setupRun.status === 'running'
      ? 'Worktree setup running'
      : setupRun.status === 'failed'
        ? 'Worktree setup failed'
        : 'Worktree setup done';
  const hasOutput = setupRun.stdoutTail || setupRun.stderrTail;
  const globalConfig = useKartonState((s: AppState) => s.globalConfig);
  const scriptName = getBaseName(setupRun.scriptPath) || setupRun.scriptPath;
  const resolveScriptPath = useCallback(
    (filePath: string) => (filePath === setupRun.scriptPath ? filePath : null),
    [setupRun.scriptPath],
  );
  const handleOpenScript = useCallback(() => {
    window.open(
      getIDEFileUrl(setupRun.scriptPath, globalConfig.openFilesInIde),
      '_blank',
    );
  }, [globalConfig.openFilesInIde, setupRun.scriptPath]);

  return (
    <>
      <div className="border-derived-subtle border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <WorkspaceSetupStatusIndicator setupRun={setupRun} />
          <span className="font-semibold">{title}</span>
        </div>
        <div className="mt-1 text-2xs text-subtle-foreground">
          {setupRun.status === 'running'
            ? `Started at ${formatSetupTimestamp(setupRun.startedAt)} · ${duration}`
            : `Finished in ${duration}`}
        </div>
      </div>
      <OverlayScrollbar
        className="mask-alpha max-h-80"
        style={maskStyle}
        options={{ overflow: { x: 'hidden', y: 'scroll' } }}
        onViewportRef={setScrollViewport}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 px-2.5 py-2 text-2xs">
          <span className="pt-0.5 text-subtle-foreground leading-none">
            Script
          </span>
          <FileContextMenu
            relativePath={setupRun.scriptPath}
            resolvePath={resolveScriptPath}
          >
            <Tooltip>
              <TooltipTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-auto min-w-0 items-center justify-start gap-1 px-0 py-0 text-muted-foreground"
                  onClick={handleOpenScript}
                >
                  <FileIcon filePath={scriptName} className="size-4" />
                  <span className="truncate font-mono leading-none">
                    {scriptName}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{setupRun.scriptPath}</TooltipContent>
            </Tooltip>
          </FileContextMenu>
          {setupRun.exitCode !== null && (
            <>
              <span className="text-subtle-foreground leading-none">Exit</span>
              <span className="font-mono text-muted-foreground leading-none">
                {setupRun.exitCode}
              </span>
            </>
          )}
          {setupRun.message && (
            <>
              <span className="text-subtle-foreground leading-none">
                Status
              </span>
              <span className="text-muted-foreground leading-normal">
                {setupRun.message}
              </span>
            </>
          )}

          {setupRun.stdoutTail && (
            <SetupOutputBlock label="Output" output={setupRun.stdoutTail} />
          )}
          {setupRun.stderrTail && (
            <SetupOutputBlock label="Errors" output={setupRun.stderrTail} />
          )}
          {!hasOutput && (
            <>
              <span className="text-subtle-foreground leading-none">
                Output
              </span>
              <span className="text-muted-foreground leading-none">
                No output captured yet.
              </span>
            </>
          )}
        </div>
      </OverlayScrollbar>
    </>
  );
}

function SetupOutputBlock({
  label,
  output,
}: {
  label: string;
  output: string;
}) {
  const shouldStickToBottomRef = useRef(true);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useMemo(
    () => ({ current: scrollViewport }),
    [scrollViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  useEffect(() => {
    if (!scrollViewport) return;
    const handleScroll = () => {
      const distanceFromBottom =
        scrollViewport.scrollHeight -
        scrollViewport.scrollTop -
        scrollViewport.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom <= 24;
    };
    scrollViewport.addEventListener('scroll', handleScroll);
    return () => scrollViewport.removeEventListener('scroll', handleScroll);
  }, [scrollViewport]);

  useEffect(() => {
    if (!scrollViewport || !shouldStickToBottomRef.current) return;
    scrollViewport.scrollTop = scrollViewport.scrollHeight;
  }, [output, scrollViewport]);

  return (
    <>
      <span className="pt-0.5 text-subtle-foreground leading-none">
        {label}
      </span>
      <OverlayScrollbar
        className="mask-alpha scrollbar-subtle max-h-40 min-w-0 overflow-y-auto"
        style={maskStyle}
        options={{ overflow: { x: 'hidden', y: 'scroll' } }}
        onViewportRef={setScrollViewport}
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground leading-relaxed">
          {output}
        </pre>
      </OverlayScrollbar>
    </>
  );
}
