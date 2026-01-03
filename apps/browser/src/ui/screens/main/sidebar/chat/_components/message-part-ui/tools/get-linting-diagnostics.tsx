import type { ToolPart } from '@shared/karton-contracts/ui';
import {
  IconTriangleWarningOutline18,
  IconCheck2Outline18,
} from 'nucleo-ui-outline-18';
import { useMemo, useState, useEffect, useId, useCallback } from 'react';
import { Loader2Icon, XCircleIcon } from 'lucide-react';
import { ToolPartUI } from './shared/tool-part-ui';
import { cn } from '@/utils';
import { useExploringContentContext } from './exploring';
import type { LintingDiagnostic } from '@stagewise/agent-tools';

export const GetLintingDiagnosticsToolPart = ({
  part,
  disableShimmer = false,
  showBorder = true,
}: {
  part: Extract<ToolPart, { type: 'tool-getLintingDiagnosticsTool' }>;
  disableShimmer?: boolean;
  showBorder?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const exploringContext = useExploringContentContext();
  const id = useId();

  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  const summary = part.output?.summary;
  const errors = summary?.errors ?? 0;
  const warnings = summary?.warnings ?? 0;
  const totalFiles = summary?.totalFiles ?? 0;
  const hasDiagnostics = useMemo(
    () => errors > 0 || warnings > 0,
    [errors, warnings],
  );

  // Parse files from output
  const files = useMemo(() => {
    return part.output?.files ?? [];
  }, [part.output?.files]);

  // Sync expanded state with streaming state
  useEffect(() => {
    setExpanded(streaming);
    setIsManuallyExpanded(false);
  }, [streaming]);

  // Handle user-initiated expansion toggle
  const handleUserSetExpanded = useCallback((newExpanded: boolean) => {
    setExpanded(newExpanded);
    setIsManuallyExpanded(newExpanded);
  }, []);

  // Report expansion state to parent exploring context
  useEffect(() => {
    if (!exploringContext) return;
    if (isManuallyExpanded && expanded) exploringContext.registerExpanded(id);
    else exploringContext.unregisterExpanded(id);

    return () => {
      exploringContext.unregisterExpanded(id);
    };
  }, [expanded, isManuallyExpanded, exploringContext, id]);

  // Error state display
  if (state === 'error') {
    return (
      <div
        className={cn(
          'group/exploring-part block min-w-32 rounded-xl',
          showBorder && '-mx-1 border-border/20 bg-muted-foreground/5',
        )}
      >
        <div className="flex h-6 cursor-default items-center gap-1 rounded-xl px-2.5 text-muted-foreground">
          <div className="flex w-full flex-row items-center justify-start gap-1">
            <XCircleIcon className="size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
              {part.errorText ?? 'Error checking linting diagnostics'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolPartUI
      showBorder={showBorder}
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      trigger={
        <>
          {!streaming &&
            (hasDiagnostics ? (
              <IconTriangleWarningOutline18 className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <IconCheck2Outline18 className="size-3 shrink-0 text-muted-foreground" />
            ))}
          <div
            className={cn(
              'flex flex-row items-center justify-start gap-1',
              showBorder && 'flex-1',
            )}
          >
            {streaming ? (
              <LoadingHeader disableShimmer={disableShimmer} />
            ) : (
              <SuccessHeader
                errors={errors}
                warnings={warnings}
                totalFiles={totalFiles}
                hasDiagnostics={hasDiagnostics}
                showBorder={showBorder}
              />
            )}
          </div>
        </>
      }
      content={
        <>
          {streaming && (
            <pre className="overflow-x-hidden whitespace-pre font-mono text-muted-foreground/75 text-xs">
              Checking for issues...
            </pre>
          )}
          {state === 'success' && hasDiagnostics && files.length > 0 && (
            <div className="flex flex-col gap-1">
              {files.map((file) => (
                <div key={file.path} className="flex flex-col gap-0.5">
                  <div className="truncate font-medium text-muted-foreground text-xs">
                    {file.path}
                  </div>
                  <div className="flex flex-col gap-0.5 pl-2">
                    {file.diagnostics.map((diag, idx) => (
                      <DiagnosticRow
                        key={`${file.path}-${idx}`}
                        diagnostic={diag}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {state === 'success' && !hasDiagnostics && (
            <div className="py-2 text-muted-foreground/60 text-xs">
              No linting issues found
            </div>
          )}
        </>
      }
      contentClassName="max-h-48!"
      contentFooterClassName="px-0"
    />
  );
};

const DiagnosticRow = ({ diagnostic }: { diagnostic: LintingDiagnostic }) => {
  const isError = diagnostic.severity === 1;

  return (
    <div className="flex flex-row items-start gap-1.5 text-xs">
      {isError ? (
        <XCircleIcon className="mt-0.5 size-3 shrink-0 text-red-500" />
      ) : (
        <IconTriangleWarningOutline18 className="mt-0.5 size-3 shrink-0 text-yellow-500" />
      )}
      <span className="min-w-0 flex-1 truncate text-muted-foreground/75">
        {diagnostic.message}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">
        L{diagnostic.line}:{diagnostic.column}
      </span>
    </div>
  );
};

const SuccessHeader = ({
  errors,
  warnings,
  totalFiles,
  hasDiagnostics,
  showBorder,
}: {
  errors: number;
  warnings: number;
  totalFiles: number;
  hasDiagnostics: boolean;
  showBorder?: boolean;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1 overflow-hidden">
      <span
        className={cn(
          'shrink-0 text-muted-foreground text-xs',
          !showBorder && 'font-normal text-muted-foreground/75',
        )}
      >
        {hasDiagnostics ? (
          <>
            {showBorder ? (
              'Found '
            ) : (
              <span className="font-medium text-muted-foreground">Found </span>
            )}
            {errors > 0 && (
              <span>
                {errors} error{errors !== 1 ? 's' : ''}
              </span>
            )}
            {errors > 0 && warnings > 0 && ', '}
            {warnings > 0 && (
              <span>
                {warnings} warning{warnings !== 1 ? 's' : ''}
              </span>
            )}
            {totalFiles > 0 &&
              ` in ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`}
          </>
        ) : (
          'No linting issues'
        )}
      </span>
    </div>
  );
};

const LoadingHeader = ({ disableShimmer }: { disableShimmer?: boolean }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1 overflow-hidden">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      <span
        dir="ltr"
        className={cn(
          'truncate text-xs',
          disableShimmer
            ? 'text-muted-foreground'
            : 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300',
        )}
      >
        Checking for issues...
      </span>
    </div>
  );
};
