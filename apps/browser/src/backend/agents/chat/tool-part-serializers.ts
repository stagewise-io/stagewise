import { defineToolPartSerializers } from '@stagewise/agent-core/agents';
import { allToolSchemas } from '@shared/karton-contracts/ui/agent/tools/types';

/**
 * Escape XML-significant characters in any value interpolated into a
 * compact tool summary. These summaries are embedded inside
 * `<assistant>…</assistant>` blocks in the compression prompt, so raw
 * tool inputs/outputs (paths, commands, session ids, user answers) must
 * be escaped to prevent prompt-structure injection. The `err` suffix is
 * already escaped by agent-core's `getErrorSuffix`, so callers must not
 * re-escape it.
 */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Formats a compact representation of the answers the user provided
 * to an `askUserQuestions` form. Ported verbatim from agent-core
 * (Phase 7: history-compression host serializers) so the label
 * vocabulary stays byte-identical with what the compression LLM
 * prompt documents.
 */
const formatAskUserAnswers = (
  output: {
    completed: boolean;
    cancelled: boolean;
    cancelReason?: string | null;
    answers: Record<string, unknown>;
  },
  input: {
    title: string;
    steps: readonly {
      fields: readonly { questionId: string; label: string }[];
    }[];
  },
): string => {
  const title = input?.title ?? 'form';

  if (output.cancelled || !output.completed) {
    const reason = output.cancelReason ?? 'cancelled';
    return `[asked user: ${esc(title)} → ${esc(reason)}]`;
  }

  const labelMap = new Map<string, string>();
  for (const step of input?.steps ?? []) {
    for (const field of step?.fields ?? []) {
      if (field?.questionId) {
        labelMap.set(field.questionId, field.label ?? field.questionId);
      }
    }
  }

  const answers = output.answers ?? {};
  const pairs = Object.entries(answers)
    .map(([qId, val]) => {
      const label = labelMap.get(qId) ?? qId;
      return `${esc(label)}: ${esc(val)}`;
    })
    .join('; ');
  return `[asked user: ${esc(title)} → ${pairs}]`;
};

/**
 * Browser-side compact one-liner formatters for the host-specific
 * tools the {@link BrowserChatAgent} ships. Registered onto the
 * {@link AgentHost} via `host.registerToolPartSerializers(...)` in
 * `services/agent-core-bridge/host.ts`. agent-core consults this
 * registry from {@link convertAgentMessagesToCompactMessageHistoryString}
 * for any `tool-*` part it doesn't know about (i.e. anything outside
 * the universal file-op set). Returning `undefined` here falls through
 * to the generic `[part.type + err]` marker.
 *
 * The output labels (`[shell: …]`, `[sandbox: …]`, `[lint: … → …]`,
 * `[docs-search: …]`, `[docs-read: …]`, `[asked user: …]`) match the
 * label vocabulary the compression LLM prompt documents.
 */
export const browserToolPartSerializers = defineToolPartSerializers(
  allToolSchemas,
  {
    createShellSession: ({ input, output, err }) => {
      const sid = esc(output?.session_id ?? '?');
      const cwd = esc(input.cwd ?? '');
      return `[shell: new session ${sid} in ${cwd}${err ?? ''}]`;
    },

    executeShellCommand: ({ input, output, err }) => {
      const label = esc(
        String(input.explanation ?? input.command ?? '').slice(0, 80),
      );
      if (err) return `[shell: ${label}${err}]`;
      if (output) {
        const { exit_code, timed_out } = output;
        if (timed_out) return `[shell: ${label} → timed out]`;
        if (typeof exit_code === 'number' && exit_code !== 0)
          return `[shell: ${label} → exit ${exit_code}]`;
        if (typeof exit_code === 'number') return `[shell: ${label} → ✓]`;
      }
      return `[shell: ${label}]`;
    },

    executeSandboxJs: ({ input, err }) =>
      `[sandbox: ${esc(String(input.explanation ?? '').slice(0, 80))}${err ?? ''}]`,

    getLintingDiagnostics: ({ input, output, err }) => {
      const paths = esc(
        Array.isArray(input.paths) ? input.paths.join(', ') : input.paths,
      );
      if (err) return `[lint: ${paths}${err}]`;
      if (output?.summary) {
        const s = output.summary;
        if (s.totalIssues === 0) return `[lint: ${paths} → clean]`;
        return `[lint: ${paths} → ${s.errors} errors, ${s.warnings} warnings]`;
      }
      return `[lint: ${paths}]`;
    },

    listLibraryDocs: ({ input, err }) =>
      `[docs-search: ${esc(input.name)}${err ?? ''}]`,

    searchInLibraryDocs: ({ input, err }) =>
      `[docs-read: ${esc(input.libraryId)} → ${esc(input.topic)}${err ?? ''}]`,

    askUserQuestions: ({ input, output, err }) => {
      if (err) return `[asked user: ${input.title ?? 'form'}${err}]`;
      if (output) {
        return formatAskUserAnswers(output, input);
      }
      return `[asked user: ${input.title ?? 'form'}]`;
    },
  },
);
