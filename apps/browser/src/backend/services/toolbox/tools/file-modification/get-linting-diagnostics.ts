import type { MountedLspServices } from '../../utils';
import {
  getLintingDiagnosticsToolInputSchema,
  type DiagnosticsSummary,
  type FileDiagnostics,
  type LintingDiagnostic,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { rethrowCappedToolOutputError } from '../../utils';
import { resolveMountedLspService } from '../../utils/path-mounting';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */

export const DESCRIPTION = `Get linting and type-checking diagnostics (TypeScript errors, ESLint/Biome violations, other LSP-reported problems) for the specified files.

Parameters:
- paths (string[], REQUIRED): File paths to check. Each path must include the mount prefix (e.g. "w3a1f/src/index.ts"). Use the same mount-prefixed paths returned by file tools.

Behavior: Returns per-file diagnostics with severity, source, message, line, and column, plus an overall summary.`;

type LintingDiagnosticsResult = {
  files: FileDiagnostics[];
  summary: DiagnosticsSummary;
};

const TOOL_TIMEOUT_MS = 15_000;

export const getLintingDiagnosticsToolExecute = async (
  mountedLspServices: MountedLspServices,
  paths: string[],
) => {
  if (paths.length === 0) {
    return {
      files: [],
      summary: {
        totalFiles: 0,
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        hints: 0,
      },
    };
  }

  const resultOrTimeout = await Promise.race([
    doGetLintingDiagnostics(mountedLspServices, paths),
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), TOOL_TIMEOUT_MS),
    ),
  ]);

  if (resultOrTimeout === 'timeout') {
    return {
      message:
        'Diagnostics request timed out. LSP servers may be unresponsive. You can proceed without diagnostics.',
      files: [],
      summary: {
        totalFiles: 0,
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        hints: 0,
      },
    };
  }

  return resultOrTimeout;
};

async function doGetLintingDiagnostics(
  mountedLspServices: MountedLspServices,
  paths: string[],
) {
  // Touch all files in parallel so LSP servers open and analyze them,
  // then wait for diagnostics to arrive (3s timeout per file).
  await Promise.all(
    paths.map(async (mountedPath) => {
      try {
        const { lspService, path } = resolveMountedLspService(
          mountedLspServices,
          mountedPath,
        );
        await lspService.touchFile(path, true);
      } catch {
        // Silently skip -- we still attempt to collect diagnostics below
      }
    }),
  );

  const files: LintingDiagnosticsResult['files'] = [];

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfos = 0;
  let totalHints = 0;

  for (const mountedPath of paths) {
    try {
      const { lspService, path } = resolveMountedLspService(
        mountedLspServices,
        mountedPath,
      );

      const aggregatedDiagnostics =
        await lspService.getDiagnosticsForFile(path);

      if (aggregatedDiagnostics.length === 0) continue;

      const fileDiagnostics: LintingDiagnostic[] = [];

      for (const { serverID, diagnostic } of aggregatedDiagnostics) {
        const severity = (diagnostic.severity ?? 1) as 1 | 2 | 3 | 4;
        fileDiagnostics.push({
          line: diagnostic.range.start.line + 1,
          column: diagnostic.range.start.character + 1,
          severity,
          source: diagnostic.source ?? serverID,
          message: diagnostic.message,
          code:
            diagnostic.code !== undefined ? String(diagnostic.code) : undefined,
        });

        if (severity === 1) totalErrors++;
        else if (severity === 2) totalWarnings++;
        else if (severity === 3) totalInfos++;
        else if (severity === 4) totalHints++;
      }

      if (fileDiagnostics.length > 0) {
        files.push({ path: mountedPath, diagnostics: fileDiagnostics });
      }
    } catch (error) {
      rethrowCappedToolOutputError(error);
    }
  }

  const totalIssues = totalErrors + totalWarnings + totalInfos + totalHints;

  if (totalIssues === 0) {
    return {
      message: 'No linting issues found in the specified files.',
      files: [],
      summary: {
        totalFiles: files.length,
        totalIssues,
        errors: totalErrors,
        warnings: totalWarnings,
        infos: totalInfos,
        hints: totalHints,
      },
    };
  }

  return {
    message: `Found ${totalIssues} linting issue${totalIssues !== 1 ? 's' : ''} in ${files.length} file${files.length !== 1 ? 's' : ''}.`,
    files,
    summary: {
      totalFiles: files.length,
      totalIssues,
      errors: totalErrors,
      warnings: totalWarnings,
      infos: totalInfos,
      hints: totalHints,
    },
  };
}

export const getLintingDiagnostics = (mountedLspServices: MountedLspServices) =>
  tool({
    description: DESCRIPTION,
    inputSchema: getLintingDiagnosticsToolInputSchema,
    strict: true,
    execute: async ({ paths }) => {
      return getLintingDiagnosticsToolExecute(mountedLspServices, paths);
    },
  });
