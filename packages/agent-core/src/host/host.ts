import type { DomainId } from '../env/contract';
import type { FileTransformer } from '../file-read-transformer/types';
import { DEFAULT_WORKSPACE_MD_RELATIVE_PATH } from '../services/mount-manager/workspace-info';
import type { AgentTypes } from '../types/agent';
import type { HostEnvironmentSources } from './environment-sources';
import type { Logger } from './logger';
import type { HostModels } from './models';
import type { HostPaths } from './paths';
import type { TelemetrySink } from './telemetry';

/**
 * OS shell integration for paths on the host machine (e.g. reveal in file
 * manager). Optional on hosts that do not expose a desktop shell.
 */
export interface HostDesktop {
  /**
   * Opens a directory (or file) in the OS shell. Returns a non-empty error
   * string on failure, or an empty string on success (host shell
   * `openPath`-style contract).
   */
  revealPathInFileManager(absolutePath: string): Promise<string>;
}

/**
 * A "special link protocol" (markdown link with empty label and a
 * `protocol:value` href, e.g. `[](tab:abc)`) the chat agent is taught
 * to emit. agent-core ships baseline protocols (`color`, `path`); hosts
 * register additional protocols here. The host is responsible for the
 * renderer that consumes the produced markdown.
 */
export interface OutputProtocol {
  /** Token after the `[]:` (e.g. `'tab'`, `'shell'`). */
  name: string;
  /** Example syntax shown in the prompt table (e.g. `'[](tab:{id})'`). */
  syntax: string;
  /** Single-sentence rule shown in the prompt (when/how to use). */
  rule: string;
}

/**
 * A named markdown link alias the agent can emit with a descriptive
 * label (e.g. `[Report issue](report-agent-issue)`). Host UI resolves
 * the alias to a concrete URL. agent-core bakes in the stagewise
 * product aliases (`report-agent-issue`, `socials-*`, ...); hosts may
 * append more.
 */
export interface OutputAlias {
  alias: string;
  useCase: string;
}

/**
 * Context passed to a {@link ToolPartSerializer}. `input` and `output`
 * are read from the persisted `AgentMessage` tool part; `err` is a
 * pre-formatted suffix string when the part is in an error/denied
 * state (or `undefined` otherwise).
 */
export interface ToolPartSerializerContext<
  TInput = unknown,
  TOutput = unknown,
> {
  /** Tool input as persisted on the AgentMessage part. */
  input: TInput;
  /** Tool output when `state === 'output-available'`, else `undefined`. */
  output: TOutput | undefined;
  /**
   * Pre-formatted error suffix (e.g. `' ✗ <reason>'`, `' ✗ denied'`)
   * when the part is in an error/denied state, else `undefined`.
   * Serializers should append this to their output where appropriate.
   */
  err: string | undefined;
}

/**
 * Compact one-liner formatter for a single tool part during history
 * compression. Returning a non-empty string emits that label into the
 * compressed history; returning `undefined` falls through to the
 * generic `[part.type + err]` marker.
 *
 * Build a host-side registry with `defineToolPartSerializers(schemas,
 * fns)` to get full type inference on `input` / `output`.
 */
export type ToolPartSerializer<TInput = unknown, TOutput = unknown> = (
  ctx: ToolPartSerializerContext<TInput, TOutput>,
) => string | undefined;

/**
 * Closed set of system-prompt slots a host may override. The prompt
 * builder stitches these into the final chat-agent prompt; any slot
 * the host does not set falls back to the agent-core default.
 *
 * - `intro` — top-of-prompt identity line.
 * - `soul` — identity + behavior rules block. Replaces the default
 *   `<soul>` body wholesale.
 * - `environmentPreamble` — host-specific cross-cutting wording
 *   prepended inside `<environment>` before the per-adapter prompt
 *   sections.
 * - `authorities` — security/trust hierarchy block. Replaces the
 *   default `<authorities>` body wholesale.
 */
export type SystemPromptFragmentKey =
  | 'intro'
  | 'soul'
  | 'environmentPreamble'
  | 'authorities';

/**
 * Per-agent-type context profile. Hosts call
 * {@link AgentHost.defineAgentProfile} once per agent type to declare:
 *  - which env domains its turns may consume,
 *  - which host-specific output protocols/aliases the chat prompt builder
 *    appends to the baseline,
 *  - which system-prompt slot overrides the chat prompt builder uses.
 *
 * Profiles are explicit by design: an agent type with no registered
 * profile receives no env state and only the agent-core baseline prompt.
 * Output protocols/aliases/system-prompt-fragments only apply when an
 * agent uses the chat system-prompt builder (e.g. `ChatAgent`); thin
 * agents that build their own prompt (e.g. `WorkspaceMdAgent`) ignore
 * those slots.
 */
export interface AgentProfile {
  /**
   * Allow-list of env-state {@link DomainId}s this agent type may
   * capture per turn. The order is informational; the registry's
   * `renderOrder` still controls prompt-section composition.
   */
  envDomainIds: readonly DomainId[];
  /**
   * Host-declared output protocols appended to the baseline in the
   * chat agent's `<output-style>` table. Omit to use only the baseline.
   */
  outputProtocols?: readonly OutputProtocol[];
  /**
   * Host-declared output aliases appended to the baseline in the chat
   * agent's `<output-style>` table. Omit to use only the baseline.
   */
  outputAliases?: readonly OutputAlias[];
  /**
   * Host-supplied overrides for the four chat system-prompt slots.
   * Unset slots fall back to the agent-core default at prompt-build
   * time.
   */
  systemPromptFragments?: Partial<Record<SystemPromptFragmentKey, string>>;
}

/**
 * Construction-time configuration for {@link AgentHost}.
 *
 * Holds only the capability singletons (one implementation per slot).
 * Host-extensible keyed registries (file-read transformers, tool-part
 * serializers, output protocols / aliases, system-prompt fragments)
 * are populated **after** construction via the corresponding
 * `register*` / `set*` methods.
 *
 * Optional fields are honoured per SPEC §Host Interface; readers
 * null-check before use.
 */
export interface AgentHostConfig {
  paths: HostPaths;
  models: HostModels;
  logger: Logger;
  telemetry?: TelemetrySink;
  desktop?: HostDesktop;
  /**
   * Raw data feeds consumed by the core-owned env-state
   * `DomainAdapter`s (workspace, agentsMd, enabledSkills).
   * Optional so hosts that don't run the env-snapshot pipeline (tests,
   * early bring-up) can omit it; providers null-check before use.
   */
  environmentSources?: HostEnvironmentSources;
  /**
   * Reads WORKSPACE.md from an absolute workspace path. Returns `null`
   * when missing (same contract as `readWorkspaceMd` in mount-manager).
   */
  readWorkspaceMdFromDisk?: (
    absoluteWorkspacePath: string,
  ) => Promise<string | null>;
  /**
   * Mount-relative path to the WORKSPACE.md project memo (e.g.
   * `'.stagewise/WORKSPACE.md'`). Defaults to `.stagewise/WORKSPACE.md`
   * when omitted.
   */
  workspaceMdRelativePath?: string;
}

/**
 * Capability seam between `@stagewise/agent-core` and its host
 * application (desktop browser app, CLI, ACP, remote).
 *
 * The host constructs an `AgentHost` at boot with the required
 * capability singletons (`paths`, `models`, `logger`, ...), then
 * populates host-extensible registries through the `register*` and
 * `set*` methods (file-read transformers, tool-part serializers,
 * output protocols / aliases, system-prompt fragments). agent-core
 * services receive the constructed instance via constructor injection
 * — they never import from the host directly.
 *
 * Singletons are exposed as readonly fields for direct field access
 * (`host.logger.debug(...)`); host-extensible registries are exposed
 * through `get*` methods that snapshot the current registration set
 * at read time. Registrations may happen at any point after
 * construction, including lazily after async sub-services boot.
 */
export class AgentHost {
  readonly paths: HostPaths;
  readonly models: HostModels;
  readonly logger: Logger;
  readonly telemetry: TelemetrySink | undefined;
  readonly desktop: HostDesktop | undefined;
  /**
   * Raw data feeds consumed by core-owned env-state `DomainAdapter`s.
   * Intentionally mutable so hosts can late-bind the sources when they
   * depend on services that boot after `AgentHost` construction
   * (e.g. the browser binds this after `ToolboxService` is ready).
   * Readers must null-check.
   */
  environmentSources: HostEnvironmentSources | undefined;
  readonly readWorkspaceMdFromDisk:
    | ((absoluteWorkspacePath: string) => Promise<string | null>)
    | undefined;

  private readonly _workspaceMdRelativePath: string;
  private readonly fileReadTransformers: Record<string, FileTransformer> = {};
  private readonly toolPartSerializers: Record<string, ToolPartSerializer> = {};
  private readonly profiles = new Map<AgentTypes, AgentProfile>();

  constructor(cfg: AgentHostConfig) {
    this.paths = cfg.paths;
    this.models = cfg.models;
    this.logger = cfg.logger;
    this.telemetry = cfg.telemetry;
    this.desktop = cfg.desktop;
    this.environmentSources = cfg.environmentSources;
    this.readWorkspaceMdFromDisk = cfg.readWorkspaceMdFromDisk;
    this._workspaceMdRelativePath =
      cfg.workspaceMdRelativePath ?? DEFAULT_WORKSPACE_MD_RELATIVE_PATH;
  }

  /**
   * Mount-relative path to the WORKSPACE.md project memo. Always
   * returns a value; falls back to `.stagewise/WORKSPACE.md` when the
   * host did not configure one.
   */
  workspaceMdRelativePath(): string {
    return this._workspaceMdRelativePath;
  }

  /**
   * Register a single file-read transformer for `ext` (lowercased,
   * leading dot, e.g. `'.textclip'`). Consulted **before** the core
   * built-in `TRANSFORMER_BY_EXT` table, so hosts can both override
   * defaults (rare) and register transformers for host-specific blob
   * types without forking core.
   *
   * Reuse core's built-in `textBlobTransformer`
   * (`@stagewise/agent-core/file-read-transformer`) for generic
   * structured-text payloads, or supply a custom `FileTransformer`.
   */
  registerFileReadTransformer(ext: string, transformer: FileTransformer): void {
    this.fileReadTransformers[ext] = transformer;
  }

  /**
   * Bulk variant of {@link registerFileReadTransformer}. Useful when
   * hosts have a pre-built mapping. Later entries with the same key
   * overwrite earlier ones, matching the single-entry semantics.
   */
  registerFileReadTransformers(
    bag: Readonly<Record<string, FileTransformer>>,
  ): void {
    for (const [ext, t] of Object.entries(bag)) {
      this.fileReadTransformers[ext] = t;
    }
  }

  /**
   * Snapshot of all currently-registered file-read transformers,
   * keyed by lowercased file extension (incl. the leading dot).
   *
   * Returns a read-only view over the live registry; callers must not
   * mutate the returned object.
   */
  getFileReadTransformers(): Readonly<Record<string, FileTransformer>> {
    return this.fileReadTransformers;
  }

  /**
   * Register a compact one-liner formatter for a single host-owned
   * tool (e.g. `executeShellCommand`). Keyed by **bare tool name** (no
   * `tool-` prefix). agent-core consults this registry during history
   * compression for tool parts it does not handle internally.
   */
  registerToolPartSerializer(
    toolName: string,
    serializer: ToolPartSerializer,
  ): void {
    this.toolPartSerializers[toolName] = serializer;
  }

  /**
   * Bulk variant of {@link registerToolPartSerializer}. Pair with
   * `defineToolPartSerializers(schemas, fns)` to retain full
   * type inference on `input` / `output` per tool.
   */
  registerToolPartSerializers(
    bag: Readonly<Record<string, ToolPartSerializer>>,
  ): void {
    for (const [toolName, fn] of Object.entries(bag)) {
      this.toolPartSerializers[toolName] = fn;
    }
  }

  /**
   * Resolve the serializer for `toolName`, or `undefined` if none is
   * registered. Returning `undefined` causes history compression to
   * fall through to the generic `[part.type + err]` marker.
   */
  getToolPartSerializer(toolName: string): ToolPartSerializer | undefined {
    return this.toolPartSerializers[toolName];
  }

  /**
   * Define the {@link AgentProfile} for a given agent type. Replaces
   * any previously-registered profile for the same type. Hosts MUST
   * call this for every agent type they plan to instantiate — there is
   * no implicit "default" profile.
   *
   * Scope:
   *  - `envDomainIds` filters env-state capture at the start of every
   *    turn (per {@link DomainAdapterRegistry.captureAll}) and what the
   *    chat prompt builder lists in the `<environment>` block.
   *  - `outputProtocols`/`outputAliases` are appended to the baselines
   *    in the chat agent's `<output-style>` table.
   *  - `systemPromptFragments` override the chat agent's `<intro>`,
   *    `<soul>`, `<environment>` preamble, and `<authorities>` slots.
   *
   * Agents that build their own system prompt (e.g.
   * `WorkspaceMdAgent`) ignore the protocol/alias/fragment slots — for
   * those agents only `envDomainIds` is meaningful.
   */
  defineAgentProfile(type: AgentTypes, profile: AgentProfile): void {
    this.profiles.set(type, profile);
  }

  /**
   * Lookup the registered profile for `type`, or `undefined` if the
   * host did not define one. Consumers (env capture, prompt builder,
   * message-conversion env render) treat `undefined` as "empty" — no
   * env domains, no host protocol/alias/fragment overlays.
   */
  getAgentProfile(type: AgentTypes): AgentProfile | undefined {
    return this.profiles.get(type);
  }
}
