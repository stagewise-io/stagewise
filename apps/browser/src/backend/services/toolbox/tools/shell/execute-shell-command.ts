import {
  type CreateShellSessionToolInput,
  createShellSessionToolInputSchema,
  type ExecuteShellCommandToolInput,
  type ExecuteShellCommandToolOutput,
  executeShellCommandToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { capToolOutput } from '../../utils';
import type { ShellService } from '@/services/toolbox/services/shell';
import type {
  SessionCommandRequest,
  SessionCommandResult,
} from '@/services/toolbox/services/shell/types';
import type { ModelProviderService } from '@/agents/model-provider';
import type { TelemetryService } from '@/services/telemetry';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { ToolApprovalMode } from '@shared/karton-contracts/ui/shared-types';
import { classifyShellCommand } from './smart-approval';

/** Max lines of recent shell output fed to the smart-approval classifier. */
const SMART_APPROVAL_TAIL_LINES = 30;

function mapWaitUntil(
  wu: ExecuteShellCommandToolInput['wait_until'],
): SessionCommandRequest['waitUntil'] {
  if (!wu) return undefined;
  return {
    timeoutMs: wu.timeout_ms,
    exited: wu.exited,
    outputPattern: wu.output_pattern,
    idleMs: wu.idle_ms,
  };
}

function buildResult(
  result: SessionCommandResult,
): ExecuteShellCommandToolOutput {
  const capped = capToolOutput(result.output);
  return {
    session_id: result.sessionId,
    output: capped.result,
    recent_output: pickRecentOutput(capped.result, result.recentOutput),
    exit_code: result.exitCode,
    session_exited: result.sessionExited,
    timed_out: result.timedOut,
    resolved_by: result.resolvedBy,
  };
}

/**
 * Dependencies the shell tool needs to run the smart-approval classifier
 * on demand. Injected at tool-factory build time so the tool itself
 * stays free of service lifecycle concerns.
 */
export interface SmartApprovalDeps {
  modelProviderService: Pick<ModelProviderService, 'getModelWithOptions'>;
  telemetryService: TelemetryService;
  /**
   * Invoked when the classifier flags a command. Lets the toolbox stash
   * the classifier's explanation in Karton state so the UI can render it
   * above the approve/skip buttons.
   */
  recordPendingApproval: (toolCallId: string, explanation: string) => void;
}

export const CREATE_SHELL_SESSION_DESCRIPTION = `Create new persistent shell (PTY) session on user machine.

## When to create

Sessions stateful — vars, cwd, running processes persist across commands. Only create new session when need multiple independent terminal states:

- Long-running process (dev server, watcher) occupies one session, need run other commands.
- Set env vars in one session that later commands depend on, while doing unrelated work.
- Working in two different directories simultaneously.

Do NOT create new session just because existing one in different directory — use \`cd\` in existing idle session instead.

Active sessions listed in \`<shell-sessions>\` in env-snapshot — check first. Creating session expensive (shell init delay).

## Parameters

- \`cwd\` (string, required) — initial working directory as mount prefix from env-snapshot (e.g. "wXXXX" or "wXXXX/apps/browser"), never ".".`;

export const EXECUTE_SHELL_COMMAND_DESCRIPTION = `Send input to existing persistent shell session. Session MUST already exist — use \`createShellSession\` first if no \`session_id\`.

## Snapshot model

Returns within ~15s. Does NOT block until command finishes — returned \`output\` is whatever produced so far. Full session log persisted to \`shells/<session_id>.shell.log\`, re-readable with \`read\` tool.

## resolved_by values

- \`exit\` — command finished. \`exit_code\` set.
- \`pattern\` — \`wait_until.output_pattern\` matched. Still running.
- \`idle\` — no output for idle window (default 5000ms). Usually waiting for input.
- \`timeout\` — hard timeout. Still running.
- \`abort\` — user cancelled.
- \`session_exited\` — shell died.

## Follow-up pattern

When \`resolved_by\` is \`idle\`, \`pattern\`, or \`timeout\`, command still running. Use same \`session_id\` to:

- Send stdin to answer prompts: \`{ explanation, session_id, stdin: "y\\r" }\`. \`command\` NOT required here.
- Poll output: \`{ explanation, session_id, command: "" }\`.
- Kill session: \`{ explanation, session_id, kill: true }\`.

\`explanation\` required on every follow-up.

## Parameter guidance

Defaults right for installs, builds, git, tests, interactive prompts — idle detection catches prompts. Only set \`wait_until\` when specific reason.

- Do NOT set \`wait_until.idle_ms: 0\` — disables stuck/interactive detection. Only for commands with proven long silent phases *during active work* (e.g. dev server pauses between log lines).
- Do NOT raise \`wait_until.timeout_ms\` above 30000 unless command genuinely needs it. Longer timeouts do not make commands finish sooner; follow-up calls cheap.
- \`wait_until: { exited: true }\` complete alone — no need to combine with other overrides.

## Schema summary

- \`explanation\` (string, required) — short summary.
- \`session_id\` (string, required) — from \`createShellSession\`. Never omit.
- \`command\` (string) — required on first call and polls; omit for \`stdin\` or \`kill\`.
- \`stdin\` (string) — raw bytes to PTY. Mutually exclusive with \`command\` and \`kill\`. Common: "\\x03" (Ctrl+C), "\\x1b[A" (Up), "\\r" (Enter), "y\\r" (type y + Enter).
- \`kill: true\` — hard-kill session. Mutually exclusive with \`command\` and \`stdin\`.
- \`wait_until\` (object, optional) — \`{ timeout_ms?, idle_ms?, output_pattern?, exited? }\`.`;

/**
 * Expand C-style escape sequences into real bytes.
 *
 * LLMs frequently double-escape: the JSON arrives with literal `\r`
 * (two chars: backslash + r) instead of a real CR byte.  `JSON.parse`
 * only resolves single-escaped sequences, so anything that remains
 * as a backslash pair after parsing needs translation here.
 *
 * No double-conversion risk: if JSON.parse already resolved `\r` to
 * byte 0x0D, the regex (which matches literal backslash + letter)
 * simply won't match a lone 0x0D character.
 */
const C_ESCAPE_MAP: Record<string, string> = {
  r: '\r',
  n: '\n',
  t: '\t',
  a: '\x07',
  b: '\b',
  '\\': '\\',
};

function expandCEscapes(s: string): string {
  return s.replace(
    /\\(x[0-9a-fA-F]{2}|r|n|t|a|b|\\)/g,
    (match, seq: string) => {
      if (seq.startsWith('x'))
        return String.fromCharCode(Number.parseInt(seq.slice(1), 16));

      return C_ESCAPE_MAP[seq] ?? match;
    },
  );
}

type MountedPathsGetter = () => Map<string, string>;

/**
 * Returns `recent` only when it carries information not already present in
 * `output`. Most short commands have `output` that already includes all
 * session history the tail would add, so duplicating it in a dedicated
 * field would double tokens for no gain. Longer-running sessions where the
 * tail extends beyond the per-call snapshot remain intact.
 */
function pickRecentOutput(
  output: string,
  recent: string | undefined,
): string | undefined {
  if (!recent) return undefined;
  const o = output.trimEnd();
  const r = recent.trimEnd();
  if (r.length === 0 || o === r || o.endsWith(r)) return undefined;
  return recent;
}

function splitMountPrefix(mountPrefix: string): {
  prefix: string;
  rest: string;
} {
  const slashIdx = mountPrefix.indexOf('/');
  return {
    prefix: slashIdx === -1 ? mountPrefix : mountPrefix.slice(0, slashIdx),
    rest: slashIdx === -1 ? '' : mountPrefix.slice(slashIdx + 1),
  };
}

function resolveCwd(
  mountPrefix: string | undefined,
  getMountedPaths: MountedPathsGetter,
): string {
  const mounts = getMountedPaths();

  if (mountPrefix) {
    // Split "weba9/apps/browser" into prefix "weba9" + rest "apps/browser"
    const { prefix, rest } = splitMountPrefix(mountPrefix);

    const mountRoot = mounts.get(prefix);
    if (!mountRoot) {
      throw new Error(
        `Unknown mount prefix "${prefix}". ` +
          `Available: ${[...mounts.keys()].filter((k) => k.length <= 6).join(', ')}.`,
      );
    }
    if (!rest) return mountRoot;
    const full = resolve(join(mountRoot, rest));
    // Prevent traversal outside the mount root
    if (full === mountRoot || full.startsWith(`${mountRoot}${sep}`))
      return full;
    return mountRoot;
  }

  for (const [prefix, fsPath] of mounts) {
    if (prefix !== 'att') return fsPath;
  }

  return homedir();
}

export function absoluteCwdToMountPrefix(
  absoluteCwd: string | undefined,
  getMountedPaths: MountedPathsGetter,
): string | undefined {
  if (!absoluteCwd) return undefined;
  const normalizedCwd = resolve(absoluteCwd);
  let bestPrefix: string | undefined;
  let bestRoot = '';

  for (const [prefix, mountRoot] of getMountedPaths()) {
    const resolvedRoot = resolve(mountRoot);
    if (
      (normalizedCwd === resolvedRoot ||
        normalizedCwd.startsWith(`${resolvedRoot}${sep}`)) &&
      resolvedRoot.length > bestRoot.length
    ) {
      bestPrefix = prefix;
      bestRoot = resolvedRoot;
    }
  }

  if (!bestPrefix) return undefined;
  if (normalizedCwd === bestRoot) return bestPrefix;

  return `${bestPrefix}/${normalizedCwd
    .slice(bestRoot.length + 1)
    .split(sep)
    .join('/')}`;
}

function toClassifierCwdPrefix(
  absoluteCwd: string | undefined,
  getMountedPaths: MountedPathsGetter,
): string {
  return absoluteCwdToMountPrefix(absoluteCwd, getMountedPaths) ?? '';
}

export const createShellSession = (
  shellService: ShellService,
  agentInstanceId: string,
  getMountedPaths: MountedPathsGetter,
) => {
  return tool({
    description: CREATE_SHELL_SESSION_DESCRIPTION,
    inputSchema: createShellSessionToolInputSchema,
    strict: false,
    needsApproval: async () => false,
    execute: async (params: CreateShellSessionToolInput, { toolCallId }) => {
      try {
        const cwd = resolveCwd(params.cwd, getMountedPaths);
        const sessionId = shellService.createSession(
          agentInstanceId,
          toolCallId,
          cwd,
        );
        return {
          session_id: sessionId,
          message: `Session ${sessionId} created in ${params.cwd}.`,
        };
      } finally {
        shellService.clearPendingOutputs(agentInstanceId, toolCallId);
      }
    },
  });
};

export const executeShellCommand = (
  shellService: ShellService,
  agentInstanceId: string,
  getToolApprovalMode: () => ToolApprovalMode,
  getMountedPaths: MountedPathsGetter,
  smartApproval: SmartApprovalDeps,
) => {
  return tool({
    description: EXECUTE_SHELL_COMMAND_DESCRIPTION,
    inputSchema: executeShellCommandToolInputSchema,
    strict: false,
    needsApproval: async (
      input: ExecuteShellCommandToolInput,
      { toolCallId },
    ) => {
      // Closing an agent-owned terminal is always safe to allow. It only
      // terminates a PTY process tree we spawned, and it must remain possible
      // regardless of the selected approval mode, including alwaysAsk.
      if (input.kill) return false;

      const mode = getToolApprovalMode();
      if (mode === 'alwaysAllow') return false;
      if (mode === 'alwaysAsk') return true;

      // Short-circuit read-only session operations. An empty-command poll on
      // an existing session only drains pending output and has no side effect
      // outside the agent's own process tree, so invoking the classifier here
      // would waste up to 5s × 3 fallback models for a call that can never be
      // unsafe. Non-empty `stdin` (e.g. `y\r`) still falls through to the
      // classifier so interactive prompts remain covered.
      const classifierCommand = input.command ?? input.stdin ?? '';
      if (classifierCommand === '' && input.session_id) {
        return false;
      }

      const shellTail = input.session_id
        ? (shellService.getRecentOutputForClassifier(
            input.session_id,
            SMART_APPROVAL_TAIL_LINES,
          ) ?? '')
        : '';
      const currentCwd = shellService.getSessionCurrentCwd(input.session_id);
      // If a session's current cwd is not verified by shell integration,
      // fail closed by requiring manual approval for non-read-only calls.
      if (!currentCwd) {
        const explanation =
          'Current terminal directory is unknown. Approving manually to stay safe.';
        smartApproval.recordPendingApproval(toolCallId, explanation);
        return true;
      }
      const cwdPrefix = toClassifierCwdPrefix(currentCwd, getMountedPaths);

      const result = await classifyShellCommand(
        {
          command: classifierCommand,
          cwdPrefix,
          agentExplanation: input.explanation ?? '',
          shellTail,
        },
        smartApproval.modelProviderService,
        agentInstanceId,
        smartApproval.telemetryService,
      );

      if (result.needsApproval)
        smartApproval.recordPendingApproval(toolCallId, result.explanation);

      return result.needsApproval;
    },
    execute: async (
      params: ExecuteShellCommandToolInput,
      { toolCallId, abortSignal },
    ) => {
      try {
        if (!params.session_id) {
          return {
            session_id: null,
            output: 'session_id is required. Use createShellSession first.',
            exit_code: null,
            session_exited: false,
            timed_out: false,
            resolved_by: 'abort' as const,
          };
        }

        // Stdin mode — write raw bytes, capture output
        if (params.stdin !== undefined) {
          if (params.command || params.kill) {
            return {
              session_id: params.session_id,
              output: 'stdin is mutually exclusive with command and kill.',
              exit_code: null,
              session_exited: false,
              timed_out: false,
              resolved_by: 'abort' as const,
            };
          }
          const expandedStdin = expandCEscapes(params.stdin);
          const result = await shellService.executeInSession(
            agentInstanceId,
            toolCallId,
            {
              command: expandedStdin,
              sessionId: params.session_id,
              rawInput: true,
              waitUntil: mapWaitUntil(params.wait_until),
              abortSignal,
            },
          );
          return buildResult(result);
        }

        // Kill mode — terminate session immediately
        if (params.kill) {
          const killed = shellService.killSession(params.session_id);
          return {
            session_id: params.session_id,
            output: killed
              ? 'Session killed.'
              : 'Session not found (may have already exited).',
            exit_code: null,
            session_exited: true,
            timed_out: false,
            resolved_by: 'session_exited' as const,
          };
        }

        const result = await shellService.executeInSession(
          agentInstanceId,
          toolCallId,
          {
            command: params.command ?? '',
            sessionId: params.session_id,
            waitUntil: mapWaitUntil(params.wait_until),
            abortSignal,
          },
        );
        return buildResult(result);
      } finally {
        shellService.clearPendingOutputs(agentInstanceId, toolCallId);
      }
    },
  });
};
