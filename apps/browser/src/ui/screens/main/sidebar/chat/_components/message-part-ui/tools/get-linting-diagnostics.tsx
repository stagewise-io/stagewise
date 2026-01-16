import type { ToolPart } from '@shared/karton-contracts/ui';
import {
  IconTriangleWarningOutline18,
  IconCheck2Outline18,
} from 'nucleo-ui-outline-18';
import { useMemo } from 'react';
import { Loader2Icon, XCircleIcon } from 'lucide-react';
import { ToolPartUI } from './shared/tool-part-ui';
import { cn } from '@/utils';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';
import type { LintingDiagnostic } from '@stagewise/agent-tools';

export const GetLintingDiagnosticsToolPart = ({
  part,
  disableShimmer = false,
  capMaxHeight = false,
  isLastPart = false,
}: {
  part: Extract<ToolPart, { type: 'tool-getLintingDiagnosticsTool' }>;
  disableShimmer?: boolean;
  capMaxHeight?: boolean;
  isLastPart?: boolean;
}) => {
  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  // Use the unified auto-expand hook
  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming: streaming,
    isLastPart,
  });

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

  // Error state display
  if (state === 'error') {
    return (
      <div className={cn('group/exploring-part block min-w-32 rounded-xl')}>
        <div className="flex h-6 cursor-default items-center gap-1 rounded-lg text-muted-foreground">
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
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      trigger={
        <>
          {!streaming &&
            (hasDiagnostics ? (
              <IconTriangleWarningOutline18 className="size-3 shrink-0" />
            ) : (
              <IconCheck2Outline18 className="size-3 shrink-0" />
            ))}
          <div className={cn('flex flex-row items-center justify-start gap-1')}>
            {streaming ? (
              <LoadingHeader disableShimmer={disableShimmer} />
            ) : (
              <SuccessHeader
                errors={errors}
                warnings={warnings}
                totalFiles={totalFiles}
                hasDiagnostics={hasDiagnostics}
              />
            )}
          </div>
        </>
      }
      content={
        <>
          {streaming && (
            <pre className="overflow-x-hidden whitespace-pre font-mono text-muted-foreground text-xs opacity-75">
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
            <div className="pb-1 text-muted-foreground text-xs opacity-75">
              No linting issues found
            </div>
          )}
        </>
      }
      contentClassName={capMaxHeight ? 'max-h-48' : undefined}
      contentFooterClassName="px-0"
    />
  );
};

const DiagnosticRow = ({ diagnostic }: { diagnostic: LintingDiagnostic }) => {
  const isError = diagnostic.severity === 1;

  return (
    <div className="flex flex-row items-start gap-1.5 text-xs">
      {isError ? (
        <XCircleIcon className="mt-0.5 size-3 shrink-0 text-error-foreground" />
      ) : (
        <IconTriangleWarningOutline18 className="mt-0.5 size-3 shrink-0 text-warning-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-muted-foreground opacity-75">
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
}: {
  errors: number;
  warnings: number;
  totalFiles: number;
  hasDiagnostics: boolean;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1 overflow-hidden">
      <span className={cn('shrink-0 text-xs')}>
        {hasDiagnostics ? (
          <>
            <span className="font-medium">Found </span>
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
          disableShimmer ? '' : 'shimmer-text-primary',
        )}
      >
        Checking for issues...
      </span>
    </div>
  );
};
