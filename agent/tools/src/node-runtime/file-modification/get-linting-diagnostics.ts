import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `MANDATORY: Get linting and type-checking diagnostics for files modified during this session.

YOU MUST call this tool after completing code changes to check for:
- TypeScript/JavaScript type errors (MUST be fixed)
- ESLint rule violations (SHOULD be fixed)
- Biome linting issues (SHOULD be fixed)
- Other LSP-reported problems

WORKFLOW:
1. Complete all code changes for the current task
2. Call this tool to check for issues
3. If errors/warnings found, fix them immediately
4. Only then ask the user for feedback

Never leave the codebase with unresolved errors caused by your changes.`;

export const getLintingDiagnosticsParamsSchema = z.object({
  explanation: z
    .string()
    .optional()
    .describe('One sentence explaining why you are checking diagnostics.'),
});

export type GetLintingDiagnosticsParams = z.infer<
  typeof getLintingDiagnosticsParamsSchema
>;

/**
 * Diagnostic severity levels (matches LSP DiagnosticSeverity)
 * 1 = Error, 2 = Warning, 3 = Information, 4 = Hint
 */
export type DiagnosticSeverity = 1 | 2 | 3 | 4;

/**
 * A single diagnostic issue
 */
export interface LintingDiagnostic {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** Severity: 1=error, 2=warning, 3=info, 4=hint */
  severity: DiagnosticSeverity;
  /** Source of the diagnostic (e.g., 'typescript', 'eslint', 'biome') */
  source: string;
  /** The diagnostic message */
  message: string;
  /** Optional error/rule code */
  code?: string | number;
}

/**
 * Diagnostics grouped by file
 */
export interface FileDiagnostics {
  /** Relative file path */
  path: string;
  /** List of diagnostics for this file */
  diagnostics: LintingDiagnostic[];
}

/**
 * Summary counts of diagnostics
 */
export interface DiagnosticsSummary {
  totalFiles: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
}

/**
 * Structured result from the diagnostics callback
 */
export interface LintingDiagnosticsResult {
  files: FileDiagnostics[];
  summary: DiagnosticsSummary;
}

/**
 * Callback type for retrieving linting diagnostics
 */
export type GetLintingDiagnosticsCallback =
  () => Promise<LintingDiagnosticsResult>;

/**
 * Get linting diagnostics tool
 * - Retrieves linting/type-checking diagnostics for files modified during the session
 * - Helps the agent verify code changes don't introduce errors
 */
export async function getLintingDiagnosticsToolExecute(
  _params: GetLintingDiagnosticsParams,
  getDiagnostics: GetLintingDiagnosticsCallback,
): Promise<LintingDiagnosticsResult & { message: string }> {
  try {
    const result = await getDiagnostics();

    if (result.summary.totalIssues === 0) {
      return {
        message: 'No linting issues found in modified files.',
        files: [],
        summary: result.summary,
      };
    }

    return {
      message: `Found ${result.summary.totalIssues} linting issue${result.summary.totalIssues !== 1 ? 's' : ''} in ${result.summary.totalFiles} file${result.summary.totalFiles !== 1 ? 's' : ''}.`,
      files: result.files,
      summary: result.summary,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const getLintingDiagnosticsTool = (
  getDiagnostics: GetLintingDiagnosticsCallback,
) =>
  tool({
    name: 'getLintingDiagnosticsTool',
    description: DESCRIPTION,
    inputSchema: getLintingDiagnosticsParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await getLintingDiagnosticsToolExecute(args, getDiagnostics),
      );
    },
  });
