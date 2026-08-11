import nodePath from 'node:path';
import type {
  ContentBlock,
  ToolCall,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';

type JsonObject = Record<string, unknown>;
export type ToolState = ToolCall | ToolCallUpdate;

interface MappedToolPart {
  id: string;
  part: JsonObject;
}

export function commandFromTool(tool: ToolState): string {
  return commandFromInput(jsonObject(tool.rawInput), tool.title ?? 'Command');
}

export function primaryMountPrefix(
  mountedPaths: ReadonlyMap<string, string>,
): string {
  return (
    [...mountedPaths.keys()].find((prefix) => !SPECIAL_MOUNTS.has(prefix)) ?? ''
  );
}

const SPECIAL_MOUNTS = new Set([
  'plugins',
  'apps',
  'att',
  'plans',
  'logs',
  'memory',
]);

export function mapToolParts(
  tool: ToolState,
  mountedPaths: ReadonlyMap<string, string>,
): MappedToolPart[] {
  const diffs = toolDiffs(tool);
  if (diffs.length > 0) {
    return diffs.map((diff, index) => {
      const id =
        index === 0 ? tool.toolCallId : `${tool.toolCallId}:diff:${index}`;
      return {
        id,
        part: createDiffToolPart(tool, diff, mountedPaths, id),
      };
    });
  }
  return [
    {
      id: tool.toolCallId,
      part: createToolPart(tool, mountedPaths),
    },
  ];
}

function isStagewiseUiTool(tool: ToolState): boolean {
  const name = toolName(tool);
  const title = tool.title ?? '';
  const input = jsonObject(tool.rawInput);
  return (
    name === 'request_user_input' ||
    name.includes('stagewise_request_user_input') ||
    title.includes('stagewise_request_user_input') ||
    input.tool === 'stagewise_request_user_input'
  );
}

export function isHiddenTool(
  tool: ToolState,
  hiddenToolNames: readonly string[] = [],
  hiddenToolPathPrefixes: readonly string[] = [],
): boolean {
  return (
    isStagewiseUiTool(tool) ||
    tool.title === 'Image generation' ||
    hiddenToolNames.includes(toolName(tool)) ||
    toolLocations(tool, jsonObject(tool.rawInput)).some((path) =>
      hiddenToolPathPrefixes.some((prefix) => isWithinPath(path, prefix)),
    )
  );
}

export function toolName(tool: ToolState): string {
  if (tool.name) return tool.name;
  const meta = jsonObject(tool._meta);
  for (const value of Object.values(meta)) {
    const name = textValue(jsonObject(value).toolName);
    if (name) return name;
  }
  return '';
}

export function isWorkspaceEdit(
  tool: ToolState,
  mountedPaths: ReadonlyMap<string, string>,
): boolean {
  if (tool.kind !== 'edit') return false;
  const paths = toolLocations(tool, jsonObject(tool.rawInput));
  for (const diff of toolDiffs(tool)) {
    if (!paths.includes(diff.path)) paths.push(diff.path);
  }
  if (paths.length === 0) return false;
  const roots = workspaceRoots(mountedPaths).map((root) =>
    nodePath.resolve(root),
  );
  return paths.every((path) => {
    const resolved = nodePath.isAbsolute(path)
      ? nodePath.resolve(path)
      : nodePath.resolve(roots[0] ?? '', path);
    return roots.some((root) => isWithinPath(resolved, root));
  });
}

export function toolImages(
  tool: ToolState,
): Array<Extract<ContentBlock, { type: 'image' }>> {
  return (
    tool.content?.flatMap((item) =>
      item.type === 'content' && item.content.type === 'image'
        ? [item.content]
        : [],
    ) ?? []
  );
}

export function workspaceRoots(
  mountedPaths: ReadonlyMap<string, string>,
): string[] {
  const roots: string[] = [];
  for (const [prefix, path] of mountedPaths) {
    if (!SPECIAL_MOUNTS.has(prefix) && !roots.includes(path)) roots.push(path);
  }
  return roots;
}

export function resolveMountedPath(
  mountedPath: string,
  mountedPaths: ReadonlyMap<string, string>,
): string | null {
  const separator = mountedPath.indexOf('/');
  const prefix =
    separator === -1 ? mountedPath : mountedPath.slice(0, separator);
  const root = mountedPaths.get(prefix);
  if (!root) return null;
  const resolved = nodePath.resolve(
    root,
    separator === -1 ? '' : mountedPath.slice(separator + 1),
  );
  return isWithinPath(resolved, root) ? resolved : null;
}

function createToolPart(
  tool: ToolState,
  mountedPaths: ReadonlyMap<string, string>,
): JsonObject {
  const state = toolPartState(tool);
  const completed = state !== 'input-available';
  const input = jsonObject(tool.rawInput);
  const outputText = toolOutputText(tool);
  if (tool.kind === 'execute') {
    const command = commandFromInput(input, tool.title ?? 'Command');
    const exitCode = toolExitCode(tool, completed);
    return {
      type: 'tool-executeShellCommand',
      toolCallId: tool.toolCallId,
      state,
      input: {
        explanation: tool.title ?? '',
        command,
        session_id: `acp:${tool.toolCallId}`,
      },
      output: {
        session_id: `acp:${tool.toolCallId}`,
        output: outputText,
        exit_code: exitCode,
        session_exited: completed,
        timed_out: false,
      },
      ...toolFailure(tool, outputText),
    };
  }
  if (tool.kind === 'read' && tool.locations?.[0]?.path) {
    return {
      type: 'tool-read',
      toolCallId: tool.toolCallId,
      state,
      input: { path: toMountedPath(tool.locations[0].path, mountedPaths) },
      ...(completed ? { output: { message: outputText } } : {}),
      ...toolFailure(tool, outputText),
    };
  }
  if (tool.kind === 'read' && tool.title?.startsWith('List ')) {
    const path = firstQuotedValue(tool.title);
    return {
      type: 'tool-ls',
      toolCallId: tool.toolCallId,
      state,
      input: { path: toInputPath(path ?? '', mountedPaths) },
      ...toolFailure(tool, outputText),
    };
  }
  if (tool.kind === 'search') {
    return {
      type: 'tool-grepSearch',
      toolCallId: tool.toolCallId,
      state,
      input: {
        mount_prefix: primaryMountPrefix(mountedPaths),
        query: firstQuotedValue(tool.title ?? '') ?? tool.title ?? 'search',
      },
      output: completed
        ? {
            message: outputText,
            result: {
              totalMatches: outputText.split('\n').filter(Boolean).length,
              matches: [],
              truncated: false,
            },
          }
        : undefined,
      ...toolFailure(tool, outputText),
    };
  }
  const locations = toolLocations(tool, input).map((path) =>
    toMountedPath(path, mountedPaths),
  );
  return {
    type: 'dynamic-tool',
    toolName: `acp.${toolName(tool) || tool.kind || 'tool'}`,
    toolCallId: tool.toolCallId,
    state,
    input: {
      title: tool.title,
      kind: tool.kind,
      ...(locations.length ? { locations } : {}),
    },
    ...(tool.status === 'failed'
      ? toolFailure(tool, outputText)
      : completed && outputText
        ? { output: { text: outputText } }
        : completed
          ? { output: { status: 'completed' } }
          : {}),
  };
}

function createDiffToolPart(
  tool: ToolState,
  diff: ReturnType<typeof toolDiffs>[number],
  mountedPaths: ReadonlyMap<string, string>,
  toolCallId: string,
): JsonObject {
  const state = toolPartState(tool);
  const path = toMountedPath(diff.path, mountedPaths);
  if (tool.kind === 'delete') {
    return {
      type: 'tool-delete',
      toolCallId,
      state,
      input: { path },
      output: { _diff: { before: diff.oldText ?? '', after: null } },
      ...toolFailure(tool, toolOutputText(tool)),
    };
  }
  if (diff.oldText == null) {
    return {
      type: 'tool-write',
      toolCallId,
      state,
      input: { path, content: diff.newText },
      output: { _diff: { before: null, after: diff.newText } },
      ...toolFailure(tool, toolOutputText(tool)),
    };
  }
  return {
    type: 'tool-multiEdit',
    toolCallId,
    state,
    input: {
      path,
      edits: [{ old_string: diff.oldText, new_string: diff.newText }],
    },
    output: {
      result: { editsApplied: 1 },
      _diff: { before: diff.oldText, after: diff.newText },
    },
    ...toolFailure(tool, toolOutputText(tool)),
  };
}

function toolFailure(tool: ToolState, outputText: string): JsonObject {
  return tool.status === 'failed'
    ? { errorText: outputText || `${tool.title ?? 'Tool'} failed` }
    : {};
}

function toolDiffs(tool: ToolState) {
  return (
    tool.content?.filter(
      (content): content is Extract<typeof content, { type: 'diff' }> =>
        content.type === 'diff',
    ) ?? []
  );
}

function toolLocations(tool: ToolState, input: JsonObject): string[] {
  const locations = (tool.locations ?? []).map(({ path }) => path);
  for (const key of ['path', 'filePath', 'file_path']) {
    const path = textValue(input[key]);
    if (path && !locations.includes(path)) locations.push(path);
  }
  return locations;
}

function isWithinPath(path: string, prefix: string): boolean {
  const resolvedPath = nodePath.resolve(path);
  const resolvedPrefix = nodePath.resolve(prefix);
  return (
    resolvedPath === resolvedPrefix ||
    resolvedPath.startsWith(`${resolvedPrefix}${nodePath.sep}`)
  );
}

function toolPartState(tool: ToolState) {
  if (tool.status === 'failed') return 'output-error' as const;
  return tool.status === 'completed'
    ? ('output-available' as const)
    : ('input-available' as const);
}

function toolOutputText(tool: ToolState): string {
  const text = (tool.content ?? []).flatMap((item) =>
    item.type === 'content' && item.content.type === 'text'
      ? [item.content.text]
      : [],
  );
  if (text.length > 0) return text.join('\n');
  const terminalOutput = jsonObject(jsonObject(tool._meta).terminal_output);
  if (typeof terminalOutput.data === 'string') return terminalOutput.data;
  const output = jsonObject(tool.rawOutput);
  if (typeof output.formatted_output === 'string') {
    return output.formatted_output;
  }
  if (typeof output.output === 'string') return output.output;
  if (typeof tool.rawOutput === 'string') return tool.rawOutput;
  return '';
}

function toolExitCode(tool: ToolState, completed: boolean): number | null {
  const terminalExit = jsonObject(jsonObject(tool._meta).terminal_exit);
  if (typeof terminalExit.exit_code === 'number') {
    return terminalExit.exit_code;
  }
  const exitCode = jsonObject(tool.rawOutput).exit_code;
  if (typeof exitCode === 'number') return exitCode;
  return tool.status === 'failed' ? 1 : completed ? 0 : null;
}

function firstQuotedValue(value: string): string | undefined {
  return value.match(/['"]([^'"]+)['"]/)?.[1];
}

function commandFromInput(input: JsonObject, fallback: string): string {
  const command = input.command;
  const args = Array.isArray(input.args)
    ? input.args.filter((arg): arg is string => typeof arg === 'string')
    : [];
  return typeof command === 'string' ? [command, ...args].join(' ') : fallback;
}

function toMountedPath(
  absolutePath: string,
  mountedPaths: ReadonlyMap<string, string>,
): string {
  if (!nodePath.isAbsolute(absolutePath)) {
    const prefix = absolutePath.split('/')[0];
    if (prefix && mountedPaths.has(prefix)) return absolutePath;
    return toInputPath(absolutePath, mountedPaths);
  }
  const path = nodePath.resolve(absolutePath);
  const match = [...mountedPaths]
    .filter(([, root]) => isWithinPath(path, root))
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (!match) return absolutePath;
  const [prefix, root] = match;
  const relative = nodePath.relative(root, path).split(nodePath.sep).join('/');
  return relative ? `${prefix}/${relative}` : prefix;
}

function toInputPath(
  path: string,
  mountedPaths: ReadonlyMap<string, string>,
): string {
  const prefix = primaryMountPrefix(mountedPaths);
  if (!path) return prefix;
  if (nodePath.isAbsolute(path)) return toMountedPath(path, mountedPaths);
  return prefix ? `${prefix}/${path.replace(/^\.\//, '')}` : path;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function jsonObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
