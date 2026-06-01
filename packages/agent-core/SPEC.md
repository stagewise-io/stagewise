# Agent Core Extraction Spec

## Purpose

This document is the canonical design and implementation brief for extracting the current stagewise agent system out of the Electron browser app and into a standalone agent package.

The goal is **not** to rewrite the agent, redesign the UI, or introduce remote execution immediately. The goal is to create a clean package boundary that lets the existing browser app keep identical behavior while making the agent portable enough for later CLI, ACP/editor, checkpointing, and remote/cloud execution work.

A coding agent should be able to read this file and understand:

- why the extraction is happening;
- where the current system is coupled to Electron/Karton/UI state;
- what sprint 1 must deliver;
- what decisions are already locked;
- what tradeoffs were accepted;
- what must explicitly not be done yet.

---

## Background

The current agent implementation lives mostly in:

- `apps/browser/src/backend/agents/`
- `apps/browser/src/backend/services/toolbox/`
- `apps/browser/src/backend/services/agent-manager/`
- `apps/browser/src/backend/services/diff-history/`
- related backend utilities such as `utils/paths.ts` and `utils/attachment-blobs.ts`

The central runtime class is currently:

- `apps/browser/src/backend/agents/shared/base-agent/base-agent.ts`

The current system works well for the Electron browser product, but it is tightly coupled to the host application in several ways:

1. **Karton is used as both transport and shared backend state bus.**
  Backend services read/write `uiKarton.state` directly, not merely to communicate with the UI.
2. **Electron APIs leak into services near the agent boundary.**
  Examples include path resolution via `app.getPath`, `shell.openExternal`, dialogs, `safeStorage`, and Electron utility processes.
3. **Toolbox, diff-history, mount-management, sandbox, and agent lifecycle are interwoven.**
  The agent core cannot simply be copied into a package because supporting services still depend on browser-app state and Electron-specific services.
4. **The current command surface is Karton procedure handlers.**
  Agent lifecycle commands such as create, send message, retry, revert, mount workspace, etc. are registered directly as Karton handlers inside browser backend services.

The long-term architecture is to evolve toward a portable agent core that can run in multiple hosts:

- the current Electron browser app;
- a headless CLI process;
- ACP-compatible editors such as Zed;
- resumable/checkpointed local sessions;
- later remote/cloud sessions;
- ultimately a split-brain architecture where the browser may act as UI/tool provider while the agent core may run elsewhere.

---

## Long-Term Direction

The long-term target is a **Split-Brain architecture**:

- The **agent core** owns reasoning, conversation state, tool orchestration, command handling, and session lifecycle.
- The **host environment** provides capabilities: paths, models, shell, browser, credentials, user interaction, sandbox worker execution, etc.
- The **UI/client layer** observes agent state/events and sends commands, but does not own agent internals.
- Karton becomes one possible adapter, not the canonical state model.
- ACP, stdio, WebSocket, and other transports become adapters over the same agent command/event interface.

The eventual event model should be a typed semantic event stream, e.g.:

- `assistant_message_chunk`
- `tool_call_started`
- `tool_call_output_delta`
- `tool_call_finished`
- `conversation_reverted`
- `workspace_mount_added`

However, **sprint 1 does not implement the final event-stream architecture**. It creates the package boundary and agent-owned state layer that make a future event stream possible without a second major extraction.

---

## Sprint 1 Goal

Sprint 1 extracts the agent and intrinsic services into a new package while keeping the current browser app behavior unchanged.

The target package name used in this document is:

```txt
packages/agent-core
```

The exact package name can be adjusted if project conventions require it, but the conceptual boundary should remain the same.

Sprint 1 must produce:

1. A standalone agent package that can be imported by `apps/browser`.
2. A host interface that removes direct Electron dependencies from the agent package.
3. An agent-owned state store that replaces direct internal dependence on Karton as the canonical backend state bus.
4. A Karton bridge in `apps/browser` that mirrors agent state to the existing UI and forwards Karton procedures to package-native commands.
5. A moved `AgentManager` command/lifecycle layer, not merely a low-level `AgentInstance` factory.
6. Identical user-facing behavior in the Electron browser app.

Sprint 1 is expected to be a **3–4 week sprint**, because the full `AgentManager` migration is in scope.

---

## Explicit Non-Goals for Sprint 1

Do **not** do these in sprint 1:

- Do not build the CLI binary.
- Do not build ACP support.
- Do not implement cloud/remote execution.
- Do not design or implement the final typed event-stream protocol.
- Do not replace Karton in the UI.
- Do not rewrite the UI.
- Do not abstract all filesystem operations behind a generic filesystem capability.
- Do not remove Node.js as an assumption.
- Do not split or deeply refactor large services just because they are large.
- Do not redesign the prompt system.
- Do not redesign tool schemas.
- Do not change user-visible behavior.
- Do not change undo/revert semantics beyond what is required for the package boundary.

The browser app should continue to use Karton. The difference is that Karton becomes an adapter/bridge over agent-owned state and commands rather than the canonical store used internally by agent services.

---

## Current Coupling Points

### 1. Electron imports near the agent boundary

Electron imports directly relevant to the extraction include:


| File                                                               | Electron use                                             | Sprint 1 resolution                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| `apps/browser/src/backend/utils/paths.ts`                          | `app.getPath`, `app.isPackaged`, `process.resourcesPath` | Replace with host-provided paths.                         |
| `apps/browser/src/backend/services/agent-manager/agent-manager.ts` | `shell.openExternal`                                     | Move behind host user-interaction capability.             |
| `apps/browser/src/backend/utils/persisted-data.ts`                 | `safeStorage`                                            | Move behind host secret-box capability.                   |
| `apps/browser/src/backend/services/file-picker.ts`                 | `dialog.showOpenDialog`                                  | Host-owned path selection. Agent receives concrete paths. |
| `apps/browser/src/backend/services/sandbox/index.ts`               | `utilityProcess`                                         | Host-owned sandbox worker execution capability.           |


Most other Electron imports are in browser/window/app services and should remain in `apps/browser`.

### 2. Karton as shared backend state

The harder coupling is not Electron. It is Karton.

The following services currently read/write `uiKarton.state` directly:

- `apps/browser/src/backend/services/agent-manager/agent-manager.ts`
- `apps/browser/src/backend/services/diff-history/index.ts`
- `apps/browser/src/backend/services/toolbox/services/mount-manager/index.ts`
- browser/page wiring that reads agent/toolbox state:
  - `apps/browser/src/backend/wiring/pages-handler-wiring.ts`
  - `apps/browser/src/backend/wiring/pages-state-sync.ts`
  - `apps/browser/src/backend/services/window-layout/ui-controller.ts`

Examples of coupled state include:

- `state.agents.instances[agentId]`
- `state.toolbox[agentId].workspace.mounts`
- `state.toolbox[agentId].pendingFileDiffs`
- sandbox stream state under toolbox slices
- pending file edits and diff rendering state

This is the crux of the extraction. The new package needs an agent-owned state store, and the browser app needs a bridge that mirrors this store to Karton so existing UI consumers keep working.

### 3. Karton procedure handlers as command API

`AgentManagerService.registerKartonHandlers()` currently defines the command API implicitly by registering Karton procedure handlers.

Sprint 1 must extract this into a package-native command registry, then have the browser app bridge Karton procedure calls into that registry.

### 4. Interactive mount flow inside MountManager

`MountManagerService.handleMountWorkspace()` currently opens a file picker when no path is passed.

This is host-specific behavior and must move out of the agent package.

The agent package should only receive concrete mount requests:

```ts
agent.mountWorkspace(agentId, absolutePath, permissions)
```

The host is responsible for obtaining the path:

- Electron: file picker dialog.
- CLI: command argument or prompt.
- ACP/editor: editor-provided workspace roots or client command.
- Cloud: configured mount table.

---

## Locked Decisions

### D1. Sprint 1 creates an agent package

Create a package under `packages/agent-core`.

The browser app imports agent functionality from this package.

### D2. The browser app remains the primary host for sprint 1

The first host implementation is the current Electron app. No CLI/ACP host is implemented yet.

### D3. Use host-provided paths, not Electron path APIs

The agent package must not import Electron.

The host provides a paths interface. The package can still use `node:fs`, `node:path`, SQLite/LibSQL, and Node APIs directly.

### D4. Keep Node.js as an assumption in sprint 1

Do not over-abstract Node filesystem/process primitives prematurely.

Sprint 1 decouples from Electron and Karton-as-state-bus, not from Node.js.

### D5. SQLite/LibSQL remains inside the agent package

The agent package owns its persistence schema, migrations, and query logic for agent-related storage.

The host provides a data directory, not a storage engine abstraction.

This avoids premature storage abstraction. Later cloud work can introduce Postgres/object storage abstractions when real requirements exist.

### D6. Host owns model construction

The host constructs ready-to-call AI SDK language model instances and exposes them via a model capability, e.g.:

```ts
host.models.get(modelId)
```

The agent owns which model ID it wants to use. The host owns how that model is authenticated and routed.

Rationale:

- keeps auth/credentials out of the agent package;
- allows Electron to use current Stagewise proxy/BYOK logic;
- allows CLI to use local env vars or config;
- allows future cloud routing to differ without changing agent core;
- prevents provider-auth policy from becoming intrinsic agent logic.

### D7. Move the full AgentManager in sprint 1

Sprint 1 moves the full agent lifecycle manager into `packages/agent-core`, not just the low-level agent classes.

This includes:

- create/resume/delete/archive lifecycle;
- parent/child agent tracking;
- persistence orchestration;
- send message / retry / replace / revert commands;
- title management;
- command registration.

Browser-specific Karton procedure registration moves into a bridge in `apps/browser`.

Rationale:

- finalizes the package command surface in sprint 1;
- avoids redoing the command surface during CLI/ACP work;
- makes sprint 2 mostly transport work, not architecture work.

Tradeoff:

- sprint 1 is larger, likely 3–4 weeks rather than ~2 weeks.

### D8. Keep the current `toolbox[agentId]` slice whole and mirror it

Do not split `toolbox[agentId]` into agent-owned vs UI-derived pieces in sprint 1.

The package-owned state should include enough of the current toolbox slice to let the Karton bridge mirror it unchanged for existing consumers.

Rationale:

- `window-layout`, `pages-api`, and UI code already consume this shape;
- splitting the slice would require designing two schemas and changing multiple consumers;
- mirroring preserves behavior while still cutting Karton as canonical store.

This can be cleaned up later once the package boundary is stable.

### D9. Port DiffHistoryService as-is

`DiffHistoryService` is large and entangled, but sprint 1 should port it mostly as-is into the agent package.

Do not split its operation-log, watcher, undo, and UI projection pieces during sprint 1.

Rationale:

- splitting it introduces new conceptual boundaries while also moving packages;
- the service is already tested and behavior-sensitive;
- preserving it reduces regression risk.

After extraction, it can be refactored internally.

### D10. Host owns mount initiation

The agent package does not open file pickers or ask the OS for directories.

The host obtains concrete paths and passes them to the agent command layer.

### D11. (Obsolete) Sandbox capability is streaming

Obsolete. Sandbox is no longer a first-class agent-core capability; it is a host-registered tool whose streaming behavior is handled by the AI SDK's native tool-output streaming. See D22 (host-owned tools) and the host registration APIs section.

### D12. Command handlers include caller identity

The package-native command registry should preserve caller identity as host-supplied metadata.

Recommended shape:

```ts
type CommandContext = {
  callerId: string;
};

type CommandHandler<Args, Result> = (
  ctx: CommandContext,
  args: Args,
) => Promise<Result>;
```

KartonBridge passes Karton's client ID. CLI can pass `cli`. ACP can pass a session/client identifier.

### D13. Parent/child agents are first-class state

The package-owned state schema must represent child agents from day one.

The current `WorkspaceMdAgent` child-spawning flow renders child progress inline in parent chat. This relationship must survive extraction.

**Invariants** (verified in `packages/agent-core/src/store/state-annotation.md` §4):

- **Back-pointer only.** Tree reconstruction relies solely on `parentAgentInstanceId`. No explicit child list or join table exists in the state or on disk.
- **On-demand traversal.** Parent→children is computed by filtering `state.agents.instances` at traversal time. Used today by delete-cascade, archive-cascade, and persistence delete-cascade.
- **Resume is root-only.** `resumeAgent` rejects instances with a non-null `parentAgentInstanceId`. Children exist transiently from a live parent; their rows persist only to keep delete-cascade correct.
- **Toolbox is per-instance.** A child's `ToolboxAgentState` is not inherited from the parent — mounts, diffs, and pending state are allocated fresh.
- **Child agents are `persistent: false`.** The only child-spawning agent today (`WorkspaceMdAgent`) sets `persistent: false`, so they are never auto-resumed on boot.
- **Parent-existence guard is host-enforced today.** Package-side guards land when the `agents` slice becomes `AgentStore`-canonical.

### D14. Agent domain types move into the agent package

Agent domain types currently under `apps/browser/src/shared/karton-contracts/ui/agent/*` and the agent-shaped parts of `apps/browser/src/shared/karton-contracts/ui/shared-types.ts` are **agent domain types serialized over Karton**, not transport types.

They must move into `packages/agent-core/src/types/` and become the canonical source of truth.

Affected types include:

- `AgentMessage`, `AgentState`, `AgentTypes`, `AgentRuntimeError`, `AgentHistoryEntry`
- all tool input/output Zod schemas and inferred types (`writeToolSchema`, `multiEditToolSchema`, ...), `StagewiseToolSet`, `ToolName`, `ToolOutputDiff`, `WithDiff`
- `MountPermission`, `MountEntry`, `MentionFileCandidate`
- `Attachment`, `AttachmentMetadata`, `AttachmentMeta` variants
- `FileDiff`, `TextFileDiff`, `ExternalFileDiff`, `FileDiffSnapshot`, `EnvironmentDiffSnapshot`, `FileResult`
- `ModelCapabilities`, `ModalityConstraint`, `ModelSettings`, `StagewiseProviderOptions`
- `WorkspaceSnapshot`, `WorkspaceMdSnapshot`, `AgentsMdSnapshot`, `PlansSnapshot`, `LogsSnapshot`, `EnabledSkillsSnapshot`, `BrowserSnapshot`, `ShellSnapshot`, `ActiveAppSnapshot`, `LogIngestSnapshot`, and the other keys of **`FullEnvironmentSnapshot`** — canonical Zod schemas and inferred TypeScript types live in **`packages/agent-core/src/env/types.ts`** (Phase 8, D23). Package-built environment providers live in `packages/agent-core/src/env/providers/`; Electron registers additional providers under `apps/browser/src/backend/env-providers/`. Host-owned *capabilities* supply runtime values for host-sourced sections; they do not maintain a parallel wire-schema type fork in the browser.
- `PendingUserQuestion`, `QuestionField`, `QuestionAnswerValue`
- `MAX_DIFF_TEXT_FILE_SIZE` and related constants used by tools/diff logic

Model-provider-config types that are host-specific (`ProviderConfig`, `CustomModel`, `ModelProvider`, `PROVIDER_`*, `CustomEndpoint`) **stay in the browser/host side** — the host constructs `LanguageModel` instances and only hands the agent a model identifier and capability metadata. Any provider-config UI continues to live in `apps/browser`.

`ToolApprovalMode` / `DEFAULT_TOOL_APPROVAL_MODE` **literal unions and defaults remain Karton/UI-layer concerns** (today in `apps/browser/src/shared/karton-contracts/ui/shared-types.ts`, surfaced through `@shared`). **`AgentState.toolApprovalMode` in `@stagewise/agent-core` stores the persisted column value**, typed as `string` in core and narrowed on the host. See **D22** for policy semantics (`needsApproval`, smart classifier). Agent-core does not define the branded `ToolApprovalMode` union type itself.

For the duration of the migration, `apps/browser/src/shared/karton-contracts/ui/agent/`* re-exports these types from `@stagewise/agent-core` so the Karton contract, UI, and any browser-side code that currently imports from `@shared/karton-contracts/ui/agent/*` keep working without churn. Follow-up sprints can flip UI imports to the package directly and delete the re-export shim.

The Karton contract (`KartonContract`, `defaultState`) stays in the browser, but its state shape imports the package types.

### D15. Backward compatibility for persisted data is a hard requirement

Sprint 1 must not break existing installs.

Existing users have on-disk state that must remain fully readable after the extraction:

- agents DB at the current `<userData>/stagewise/agents/instances.sqlite` location with unchanged schema
- diff-history DB at the current `<userData>/stagewise/diff-history/data.sqlite` location with unchanged schema
- attachment blobs at `<userData>/stagewise/agents/<agentId>/data-attachments/<attachmentId>` with unchanged raw byte layout
- diff-history blob format (base-content hashes, patch encoding) unchanged
- plan files and log channel files at their current user-data paths
- agent app directories at their current paths
- shell-log files at their current paths

Concretely this means:

- no column reordering, renaming, or type changes in existing tables
- no new NOT NULL columns without defaults
- no path restructuring (e.g. moving `data-attachments/` under a different parent)
- no re-encoding of stored JSON/blob payloads
- `host.paths.*` in the Electron host must return byte-identical absolute paths to what `apps/browser/src/backend/utils/paths.ts` produces today

Schema evolution is allowed only via additive migrations that run as part of the existing migration pipeline and keep the old data readable.

### D16. AgentManager startup policy is host-parameterized

Current `AgentManagerService` on startup unconditionally creates an empty default CHAT agent and auto-mounts last-used workspaces. This is Electron-product behavior, not intrinsic agent behavior.

Sprint 1 must parameterize startup:

```ts
interface AgentManagerStartupPolicy {
  onStart:
    | { kind: 'auto-create-default'; type: AgentTypes; mountLastWorkspaces: boolean }
    | { kind: 'none' };
}
```

The browser host passes `auto-create-default` with current behavior preserved. CLI/ACP hosts can pass `none`.

### D17. Ripgrep binary is host-owned

The `grepSearch` tool requires a ripgrep binary. Currently the browser backend downloads and caches it on first use.

The agent package must not perform network installs or binary downloads.

The host is responsible for:

- ensuring a ripgrep binary exists at the path returned by `host.paths.ripgrepBaseDir()`
- choosing the install strategy (lazy download in Electron, bundled binary in CLI builds, prompt in ACP, pre-provisioned in cloud)

If the binary is missing at tool-execution time, the tool fails with a clear missing-binary error. The Electron host wraps its current `RipgrepService` into this contract.

### D18. AgentStore updates across slices are transactional

Multiple state mutations that logically belong together must be applied in one `store.update()` recipe. Listeners must observe the post-recipe state, never an intermediate.

Examples that must be atomic:

- spawning a child agent: creating `agents.instances[childId]` AND updating the parent tool-call part that references the child
- accepting a workspace mount: adding the mount entry AND starting the related watcher registration in one visible transition
- applying a tool-call result: updating history, edit summary, pending diffs, token usage together

The AgentStore API must make this easy (Immer-style draft update already achieves it). KartonBridge must mirror state in transitions, not in per-field writes.

### D19. Subscribe sequencing contract for watchers and bridges

Some subscribers have side effects that must complete before the command that triggered the state change resolves. Primary examples: diff-history watcher hydration, mount watcher startup, KartonBridge initial mirror for pages-api.

Rules:

- Synchronous subscribers run inline during `store.update()` and see the post-recipe state.
- Side-effect-bearing subscribers (watcher start/stop) register as synchronous listeners that schedule their work but expose a readiness promise.
- `agents.create`, `toolbox.mountWorkspace`, and similar commands that depend on watcher readiness must await those readiness promises before resolving to the caller.
- The store exposes an explicit `registerSideEffect(listener, { readiness })` distinct from `subscribe(listener)` to make this visible.

This preserves current behavior where a user-visible create/mount appears "ready" only once supporting infrastructure is live.

### D20. Host capabilities must be re-entrant

Host-provided surfaces (models, logger, telemetry) and host-owned tools (shell, sandbox, browser, LSP, `askUserQuestions`, etc.) may be invoked at any point during an agent step, not only at step boundaries. Concrete examples:

- A host shell tool calls `host.models.get(...)` to run its smart-approval classifier during tool execution.
- A host `askUserQuestions` tool drives a user-interaction surface while the main loop is mid-step.

All host-exposed functions must be safe to call concurrently and recursively. No host surface may rely on a single-flight assumption or per-step locking. Rate-limiting and caching must be keyed on the inner call, not on the outer step.

(Note: built-in file-mod tools read file pre-state via the package's internal `src/fs` module — `node:fs/promises` directly — not via a host capability. See D24.)

### D24. Agent-core uses `node:fs` directly in Sprint 1

Agent-core runs in the same Node.js process as its host for every planned Sprint 1–4 deployment (Electron, CLI, ACP). A separate `HostFs` capability was specified in earlier revisions; it is dropped for Sprint 1 to remove an abstraction that has no consumer diversity yet.

- **Agent-core imports `node:fs/promises` and `node:fs` directly.** All read / write / stat / readDir / mkdir / rename / remove / watch operations use Node APIs.
- **Imports are centralized.** Agent-core exposes a single internal module at `packages/agent-core/src/fs/` that wraps the Node surface used by the package (`readFile`, `writeFile`, `stat`, `readDir`, `mkdir`, `rename`, `rm`, `watch`). All services and tools import from this module; no service imports from `node:fs` directly. This is the single intercept point that lets Sprint 5 swap internals without touching call sites.
- **Mount resolution is unchanged.** Agent-core resolves mount-prefixed virtual paths (`w787f/...`, `plans/...`, `att/...`) to absolute paths via its own `MountRegistry` before calling the internal fs module.
- **Host-owned binaries still come from the host.** D17 stays — `host.paths.ripgrepBaseDir()` still exists; agent-core spawns the binary using Node `child_process`, not through a host capability.
- **No absolute-path leakage into persisted data.** Everything stored in `AgentStore`, SQLite, or on-disk message blobs uses mount-prefixed virtual paths; absolute paths never appear in persisted data. This keeps a future re-abstraction (Sprint 5+) tractable.

Rationale: there is exactly one host in Sprint 1 (Electron), and every planned Sprint 2–4 host runs in-process with agent-core. A filesystem capability adds indirection without product, portability, or testability value in those scenarios. When Sprint 5 introduces a remote agent, re-introducing an abstraction becomes a localized change inside `packages/agent-core/src/fs/` rather than a cross-cutting refactor, provided the guardrails above are upheld. A `FileSystemCapability` wire protocol is tracked as an Open Design Note for Sprint 5+ alongside `ToolDeclaration` and `ProviderDeclaration`.

### D23. Environment snapshots: typed schema, orchestrator, and providers (Phase 8)

**Canonical schema.** `packages/agent-core/src/env/types.ts` defines Zod schemas and inferred TypeScript types for every `environmentSnapshot` section (including host-populated slices such as `browser`, `shells`, `activeApp`, `logIngest`, `sandboxSessionId`, `browserSessionId`, alongside `workspace`, `plans`, `logs`, `fileDiffs`, `agentsMd`, `workspaceMd`, `enabledSkills`). `FullEnvironmentSnapshot` is the object returned by capture — every key is present at runtime with concrete empty or neutral shapes when a subsystem has nothing to report. The Karton UI contract re-exports these types from `@stagewise/agent-core` so package, bridge, and persistence share one definition (D15 wire compatibility).

**Capture.** `EnvironmentSnapshotOrchestrator` (`packages/agent-core/src/env/orchestrator.ts`) registers exactly one `EnvironmentProvider<K extends EnvironmentSectionKey>` per section key. Each provider exposes `sectionKey` and `getSnapshot(agentInstanceId)` returning `FullEnvironmentSnapshot[K]`. `captureSnapshot(agentInstanceId)` awaits all providers in parallel and assembles a `FullEnvironmentSnapshot` in fixed `ENVIRONMENT_SECTION_ORDER` (ordering is contractually significant for prompt stability). If any section lacks a provider, capture throws — hosts must register the full set before agents run.

**Provider split.**

- **Package** — `packages/agent-core/src/env/providers/`: `workspace`, `fileDiffs`, `agentsMd`, `workspaceMd`, `enabledSkills`, `plans`, `logs`.
- **Electron host** — `apps/browser/src/backend/env-providers/`: `browser`, `shells`, `sandboxSessionId`, `activeApp`, `logIngest`, `browserSessionId`. Implementations read browser/shell/sandbox services; **types** still come from `env/types.ts`.

**Prompt rendering** (separate from capture): `packages/agent-core/src/env/renderer.ts` and `packages/agent-core/src/env/changes/*` resolve effective snapshots across message history, sparsify, and emit the XML environment block. They operate on the same typed `FullEnvironmentSnapshot`, not on `unknown` blobs.

**Message metadata.** User messages carry `metadata.environmentSnapshot` (optional partial at rest; validated with `environmentSnapshotSchema` in `packages/agent-core/src/types/metadata.ts`). The field name is **not** renamed at the package boundary — persisted databases and Karton use `environmentSnapshot` end-to-end (supersedes earlier draft note R11).

**Reduced hosts.** CLI/ACP/cloud builds must still register a provider (or stub typed empty slices) for every `EnvironmentSectionKey` before `captureSnapshot` runs, or they must not start agents until the orchestrator is fully registered.

**Split-brain (Sprint 5+).** Remote deployments may tunnel capture/render via a `ProviderDeclaration`-style protocol (Open Design Notes §11). Serialized JSON must remain compatible with the same Zod schema so resumed sessions stay D15-safe.

Rationale (Phase 8 update): earlier drafts kept host sections `unknown` to avoid coupling. The shipped wire format already fixed those shapes; centralizing schemas in agent-core removes duplicate definitions and lets renderers and stores share one typed pipeline while host **subsystems** remain the authoritative **sources** for host sections.

### D22. Tool approval is host-owned (partially superseded by Phase 6)

> **Status:** The *state-location* clause of this decision was superseded in Phase 6 (agent instances ownership). `toolApprovalMode` is now a core-owned field on `AgentState` (narrowed on the host, same pattern as `activeModelId` under D14). Everything else in D22 — classifier ownership, `needsApproval` population at registration time, agent-core inertness in the approval path — remains in effect.

Tool approval *policy* is **not** an agent-core concern. Agent-core does not map the persisted preference string to per-tool `needsApproval` flags — that mapping stays in the host tool-registration layer (see bullets below).

- **Approval preference is persisted per agent.** Values: `'alwaysAsk' | 'alwaysAllow' | 'smart'` — the names are fixed by the currently shipped schema ([](path:w787f/apps/browser/src/shared/karton-contracts/ui/shared-types.ts), `toolApprovalModeSchema`). Under D15 these exact string values must survive the extraction unchanged; telemetry replay stability depends on it. Post-Phase 6 the field lives on `AgentState.toolApprovalMode` in `@stagewise/agent-core`, typed as `string` in the core and narrowed to the branded `ToolApprovalMode` union on the host via the same `Omit`-plus-re-add pattern used for `activeModelId`. The classifier, persistence column (`tool_approval_mode`), and all policy semantics remain host-owned.
- **`needsApproval` is populated at tool-registration time by the tool owner.** The host wraps every tool — its own tools directly, and universal tools returned from the agent-core factories — and sets `needsApproval` according to the current preference:
  - `'alwaysAllow'` → `needsApproval: false`
  - `'alwaysAsk'` → `needsApproval: true`
  - `'smart'` → `needsApproval: (input, ctx) => boolean | Promise<boolean>` — a host-owned classifier (e.g. [](path:w787f/apps/browser/src/backend/services/toolbox/tools/shell/smart-approval/index.ts) for shell).
- **Agent-core receives plain `Tool` objects** from the host and hands them to `streamText`. AI SDK's native `'approval-requested'` / `'approval-responded'` flow drives the UI. Agent-core is inert in the approval path beyond passing the SDK's own parts through the event stream.
- **Universal-tool factories exported by agent-core return naked `Tool` objects** — `needsApproval` is unset. The host sets it during composition. Agent-core must not default-populate `needsApproval` (even to `false`), or the host's wrap becomes a mutation step rather than a clean assignment.
- **Mode changes force tool-set rebuild.** If the user flips the preference mid-session, the host reconstructs the `ToolSet` with the new `needsApproval` mapping and hands it to agent-core for the next turn. Agent-core must not cache the `ToolSet` in a way that blocks re-registration across turns.
- **Classifier state lives entirely on the host.** The smart classifier needs the model (`host.models.get(...)`), any host-specific context, etc. None of this is surfaced to agent-core. Only the decision result (a `boolean`) is observed, via the normal `Tool.needsApproval` callback.
- **Sprint 1 is in-process.** `needsApproval` is a plain function reference. No wire, no marshalling. Transport-readiness (Sprint 2+) handles tools via a `ToolDeclaration` protocol in which approval becomes a declaration kind (`always-allow | always-ask | host-callback`) and the callback materializes as an RPC stub. See Open Design Notes.

Rationale: approval policy is tool-semantics knowledge. The host owns the tools (shell, sandbox, universal file-mod, etc.), therefore the host owns how each tool's `needsApproval` is derived. Persisting the user's preference string on `AgentState` (Phase 6) is storage for the host recipe channel — agent-core still does not run classifiers or interpret the string when building tool sets; it only carries the value through persistence like other per-agent settings.

### D21. No agent-mode system

The agent has exactly one operating mode. The earlier idea of a formal `chat` / `plan` mode system mapped onto ACP `session/request_permission` is dropped.

- No `switch_mode` tool, no mode field in `AgentState`, no mode-gated tool-availability logic in agent-core.
- Planning, previewing, debugging, and similar workflows are expressed as **slash commands** (status quo) — scoped prompt expansions that apply to the next turn, not persistent state transitions.
- Any capability needed for a specific slash command (e.g. a debug server for `/debug`) is delivered through existing host capability surfaces; agent-core does not enumerate or enforce a catalog of slash commands.

Rationale: the current product has no user-visible mode concept. Introducing one now would add state, UI surface, persistence, and ACP-projection decisions for zero concrete requirement. Slash commands cover the same ground with strictly less machinery and no new state to migrate.

---

## Package Boundary

### Agent package responsibilities

The new agent package owns:

- agent classes (`BaseAgent`, `ChatAgent`, `WorkspaceMdAgent`);
- system prompt builders;
- agent lifecycle manager;
- agent-owned state store;
- command registry;
- toolbox orchestration;
- built-in tool definitions (`read`, `ls`, `glob`, `grepSearch`, `mkdir`, `write`, `multiEdit`, `delete`, `copy`) with diff-history tracking baked into file-mod tools at definition time;
- diff-history service;
- file-read cache service;
- asset/processed-image cache services if needed by agent behavior;
- attachment blob handling;
- plan/log reading and writing;
- mount registry and mount-prefix resolution;
- SQLite/LibSQL schema/migrations for agent-owned persistence;
- child-agent spawning;
- undo/revert orchestration;
- agent domain types (see D14);
- environment snapshot orchestration via a provider registry (see `EnvironmentSnapshotOrchestrator` below and D23); the package ships providers for its owned domains (`workspace`, `plans`, `logs`, `file-diffs`, `workspace-md`, `agents-md`, `enabled-skills`) and never imports host provider shapes;
- graceful degradation when optional host-registered tools or providers are absent.

### Browser app responsibilities

`apps/browser` remains responsible for:

- Electron app lifecycle;
- windows/tabs/webcontents;
- Karton server/client setup;
- UI state transport;
- KartonBridge from agent state/commands to existing UI contracts;
- Electron implementation of host capabilities;
- file picker dialogs;
- opening external URLs;
- safeStorage implementation;
- sandbox worker process implementation and the sandbox host tool;
- shell service implementation and the shell host tool;
- browser/CDP implementation and browser host tools;
- LSP server spawning, lifecycle, transport, and the `getLintingDiagnostics` host tool (including diagnostic normalization and freshness policy);
- `askUserQuestions` host tool (structured form dispatch into the UI);
- credential-backed host tools;
- auth/session management;
- credentials UI/storage;
- telemetry backend implementation;
- auto-update, app menu, downloads, URI handling;
- page/toolbar wiring that observes mirrored agent state;
- environment-snapshot providers for host-owned domains (`browser`, `shells`, `sandbox`, `active-app`, `log-ingest`), each implementing the `EnvironmentProvider` contract and registered with the package's orchestrator at startup — see D23.

---

## Host Interface

The host interface is intentionally small: inert data and a handful of host-owned surfaces the agent may read during a turn. Everything else (shell, sandbox, browser, LSP, credentials, user-interaction, skill roots, mounts, environment providers) flows through **registration APIs** on the agent, not through capability slots on `AgentHost`. The registration APIs are specified in a separate section below (TBD in the constructive pass).

### Sketch

```ts
export interface AgentHost {
  paths: HostPaths;
  models: HostModels;
  logger: Logger;
  telemetry?: TelemetrySink;
}
```

Filesystem access is deliberately absent from the host surface; agent-core uses `node:fs` directly. See D24.

All former "capability" slots (`sandbox`, `shell`, `browser`, `lsp`, `credentials`, `secretBox`, `userInteraction`, `content`) are gone. Their behavior is delivered in one of three ways:

- **As a host-registered tool** — shell, sandbox, browser/CDP, LSP diagnostics, `askUserQuestions`, credential-backed tools. The host supplies a native AI SDK `Tool` with `execute` and `needsApproval` already wired.
- **As a host-registered environment provider** — browser tabs, shell sessions, sandbox state, active-app, log-ingest. See D23.
- **Host-internal** — file-pickers, safeStorage, credentials storage UI, auth flows. Not surfaced to agent-core at all.

Skill-root and plugin-root discovery delivery is TBD (see Skill and Plugin Resolution).


### Paths

```ts
export interface HostPaths {
  dataDir(): string;
  tempDir(): string;

  agentsDir(): string;
  agentDir(agentId: string): string;
  agentAttachmentsDir(agentId: string): string;
  agentAppsDir(agentId: string): string;
  agentShellLogsDir(agentId: string): string;

  diffHistoryDir(): string;
  diffHistoryDbPath(): string;
  diffHistoryBlobsDir(): string;

  userDataDir(): string;
  plansDir(): string;
  logsDir(): string;

  pluginsDir(): string;
  builtinSkillsDir(): string;
  ripgrepBaseDir(): string;
}
```

The host may compute these from Electron APIs, CLI config, environment variables, or cloud session metadata. The package must not know.

### Filesystem (Sprint 1: none)

There is no `HostFs` capability in Sprint 1. Agent-core uses `node:fs/promises` and `node:fs` directly through a single internal module at `packages/agent-core/src/fs/`. See D24 for the full locked decision and its guardrails.

Path semantics unchanged:

- Agent-core operates on mount-prefixed virtual paths (`w787f/...`, `plans/...`, `att/...`) at its API boundary.
- Agent-core resolves mount prefixes to absolute paths using its own `MountRegistry`, populated from `host.paths.*` results and registered workspace mounts, before calling the internal fs module.
- No absolute paths appear in persisted data or in messages crossing the package boundary.

What the host still owns:

- Directory paths (`host.paths.*`) — agent-core never hardcodes OS locations.
- Ripgrep binary location (`host.paths.ripgrepBaseDir()`) — D17; agent-core spawns it via `child_process`.
- Authoritative knowledge of which workspaces the user has mounted (delivered via `workspace.register` commands from the host).

Deferred: a `FileSystemCapability` wire protocol for Split-Brain deployments is an Open Design Note for Sprint 5+.

### Models

```ts
export interface HostModels {
  get(modelId: ModelId): Promise<LanguageModel>;
  getCapabilities(modelId: ModelId): ModelCapabilities | null;
  listAvailable?(): Promise<ModelDescriptor[]>;
}
```

The host owns auth/routing/provider construction. The agent owns selecting and calling a model.

---

## Skill and Plugin Resolution

Skills and plugins come from multiple locations — bundled with the app, installed per user, or committed per workspace. Resolution is driven by the agent package using a mix of host-provided paths, host-provided search roots, and package-owned mount iteration.

### Sources

| # | Source | Where it lives today | Discovery mechanism |
|---|--------|----------------------|---------------------|
| 1 | Built-in bundled plugins | `<app>/Resources/bundled/plugins/` (Electron) | `HostPaths.pluginsDir()` — package enumerates |
| 2 | Built-in bundled skills | `<app>/Resources/bundled/skills/` (if any) | `HostPaths.builtinSkillsDir()` — package enumerates |
| 3 | Workspace-local `.stagewise` skills | `<mount>/.stagewise/skills/` | **Package-owned**, via mount registry |
| 4 | Workspace-local `.agents` skills | `<mount>/.agents/skills/` | **Package-owned**, via mount registry |
| 5 | User-global `.stagewise` skills | `~/.stagewise/skills/` | Host-provided root (delivery mechanism TBD in constructive pass) |
| 6 | User-global `.agents` skills | `~/.agents/skills/` | Host-provided root (delivery mechanism TBD in constructive pass) |
| 7 | User-installed plugins (future) | TBD | Host-provided root (delivery mechanism TBD in constructive pass) |

### Precedence

Lower number wins on name collision:

1. Bundled plugins (source 1)
2. Bundled skills (source 2)
3. Workspace-local `.stagewise/skills` (source 3)
4. Workspace-local `.agents/skills` (source 4)
5. User-global `.stagewise/skills` (source 5)
6. User-global `.agents/skills` (source 6)
7. User-installed plugins (source 7)

Within a single source category, if multiple workspaces are mounted, all workspace-local skills are visible. Cross-workspace name collisions are deduped by first-mount-wins (stable sort by mount order in `AgentStore`).

All skills carry `trustLevel`:
- `trusted` — sources 1, 2 (shipped with the app, code-signed or equivalent).
- `user-configured` — sources 3–7 (anything the user or their workspace contributors added).

### Ownership split

- **Host owns:**
  - Bundled directory paths (`HostPaths.pluginsDir()`, `HostPaths.builtinSkillsDir()`).
  - Knowledge of OS conventions for user-global roots (`~/.stagewise/skills`, `~/.agents/skills`). Delivery mechanism (pull via `HostPaths` or push via a registration API) is TBD in the constructive pass.
  - Optional user-installed plugin registry (delivery mechanism TBD).
- **Package owns:**
  - Mount-iteration-driven workspace-local skill discovery.
  - `SKILL.md` frontmatter parsing (`name`, `description`, `user-invocable`, `agent-invocable`).
  - Precedence logic and dedupe.
  - Trust-level assignment per source.
  - Exposure to tools, slash commands, and the system prompt.
  - Caching and invalidation (re-discover on mount changes and on watched `SKILL.md` changes).

### Algorithm (package-side pseudocode)

```ts
async function resolveSkills(ctx: AgentContext): Promise<ResolvedSkill[]> {
  const out: ResolvedSkill[] = [];

  // 1–2: bundled plugins + skills (trusted)
  out.push(...await scanPluginRoot(ctx.host.paths.pluginsDir(), {
    priority: 0, trust: 'trusted',
  }));
  out.push(...await scanSkillRoot(ctx.host.paths.builtinSkillsDir(), {
    priority: 1, trust: 'trusted',
  }));

  // 3–4: workspace-local, driven by mount registry
  const mounts = ctx.store.getState().mounts; // stable order
  for (const mount of mounts) {
    out.push(...await scanSkillRoot(join(mount.path, '.stagewise', 'skills'), {
      priority: 2, trust: 'user-configured',
    }));
    out.push(...await scanSkillRoot(join(mount.path, '.agents', 'skills'), {
      priority: 3, trust: 'user-configured',
    }));
  }

  // 5–6: user-global skills — roots delivered by host; mechanism TBD.
  // 7: user-installed plugins — roots delivered by host; mechanism TBD.

  return dedupeByName(out).sort((a, b) => a.name.localeCompare(b.name));
}
```

### Graceful degradation

| Missing | Effect |
|---------|--------|
| `HostPaths.pluginsDir()` returns non-existent path | No bundled plugins; user and workspace sources still load. |
| `HostPaths.builtinSkillsDir()` returns non-existent path | No bundled skills; rest unaffected. |
| Host provides no user-global skill roots | User-global skills unavailable. Workspace and bundled still work. |
| Host provides no user-installed plugin roots | User-installed plugins unavailable. Bundled plugins and all skill sources still work. |
| No mounts | Workspace-local skills empty. Global + bundled unaffected. |

### Caching and invalidation

- Skill resolution runs once per agent session at the start, and again on any of:
  - mount add/remove event in `AgentStore`;
  - file watcher notification on any `SKILL.md` inside a resolved root (best-effort; failure to watch is non-fatal).
- Plugin resolution is eager at startup only. Plugin changes require agent restart (sprint 1 scope).
- The `enabled-skills` environment provider (package-owned, see D23) reads the cached resolution; it does not re-scan on every `capture()`.

### Split-Brain preview (sprint 5+)

Skills legitimately span both sides of the wire:

- **Bundled plugins/skills** ship with the agent binary. In a remote-agent deployment these live server-side. `HostPaths.pluginsDir()` returns a server-local path.
- **Workspace skills** live on the user's machine (workspaces are mounted from there). In Sprint 1 these reads are local `node:fs` calls; a Sprint 5 remote agent will need to route them through a future `FileSystemCapability` (see D24, Open Design Notes).
- **User-global skills** live on the user's machine. The host delivers roots pointing at local filesystem directories; reads use `node:fs` in Sprint 1 and will route through the same Sprint 5 capability.

The host content-discovery surface still returns abstract "roots" (not just raw paths) so that Sprint 5 can replace the root type without touching consumers. In Sprint 1 all roots resolve to local paths and are read directly; in Sprint 5 non-local roots become wire-routed handles.

---

## Mentions and Slash Commands

The chat composer has two popups: `@` for mention items (files, tabs, workspaces, …) and `/` for slash commands (built-in commands, skills, host-provided commands). Multiple participants contribute items: the agent package owns some kinds, the host owns others. The UI is always the aggregator and renderer.

The architecturally important question is **the provider contract shape**, not where ranking runs. Ranking is a pure function over plain-data items and can run wherever is convenient (in sprint 1: the UI).

### Two kinds of sources

Sources split by access pattern, not by ownership side:

| Kind | Access | Why |
|------|--------|-----|
| **Snapshot** | Live state slice the UI subscribes to; filtering done client-side per keystroke | Catalog is small and slow-changing. No IPC per keystroke. |
| **Query** | Async `query(input, ctx) => Promise<Item[]>` called on keystroke (debounced) | Catalog is too large to hold in memory; source must actively search. |

### Snapshot sources

Each snapshot lives in state (in `AgentStore` for package-owned, mirrored into UI state for host-owned). UI subscribes and filters client-side.

| Snapshot | Owner | Location |
|----------|-------|----------|
| Skills (user-invocable for slash; agent-invocable for prompt) | Package | `AgentStore.skills` |
| Workspaces (mounts) | Package | `AgentStore.mounts` |
| Built-in slash commands (`/compact`, `/clear`, …) | Package | `AgentStore.builtinCommands` |
| Recent edits (relevance signal) | Package | `AgentStore.recentEdits` |
| Pending diffs (relevance signal) | Package | `AgentStore.pendingDiffs` |
| Tabs (URL, title, active) | Host | host state; mirrored to UI |
| Host slash commands (e.g. `/feedback`, `/settings`) | Host | host state; mirrored to UI |
| Open-files / editor context (ACP sprint 3+) | Host | host state; mirrored to UI |

Snapshot items are plain serializable data. Each has a typed shape defined by its owner. No opaque `Item` union at the source layer — typing is preserved until the UI merges them for rendering.

### Query sources

Reserved for genuinely search-driven data. A query source is registered with a well-known name; the UI invokes it on keystroke.

| Query source | Owner | Underlying mechanism |
|--------------|-------|----------------------|
| `files` | Package | ripgrep binary at `host.paths.ripgrepBaseDir()` spawned via `child_process`; fs reads via the package's internal `src/fs` module; pending-diff / recent-edit boosts applied package-side |
| `symbols` (future) | Package | LSP workspace-symbol search |

Contract:

```ts
interface QueryProvider<TItem> {
  readonly name: string;             // stable identifier, e.g. 'files'
  readonly groupLabel: string;
  readonly boost: number;            // default relative weight in ranking
  query(input: string, ctx: QueryContext): Promise<TItem[]>;
}
```

Query providers live package-side for ranking-signal reasons (the package has recent-edits, pending-diffs, mount context). When a query provider’s backing data is host-side (e.g. files on disk), it calls through the appropriate host capability.

### Ownership split

- **UI owns:**
  - Tiptap integration, popup DOM, keyboard navigation, virtualization.
  - Icon resolution (`type` string → React component).
  - Merging snapshot slices with query-provider results.
  - Ranking math and dedupe (stateless, pure function over inputs).
  - Select-action dispatch (package command, host command, or attachment registration by `type`).
- **Package owns:**
  - Its own snapshot slices (skills, mounts, built-in commands, relevance signals).
  - Its query providers (`files`, future `symbols`).
  - Trust-level assignment and user/agent invocability metadata on skills.
- **Host owns:**
  - Its own snapshot slices (tabs, host commands, editor context).
  - Ripgrep binary location (`host.paths.ripgrepBaseDir()`, see D17); the `files` query provider spawns it with `child_process` directly.

No `SuggestionsCapability` with provider registration. Hosts contribute by maintaining their own state slices; the UI subscribes. This avoids a separate registry/aggregator abstraction for data that is already naturally in state.

### Ranking

Ranking is a pure function:

```ts
type RankingInputs = {
  input: string;                              // the current query
  snapshotItems: Array<SnapshotItem>;         // filtered client-side
  queryItems: Array<{ source: string; items: QueryItem[] }>;
};

function rank(inputs: RankingInputs): RankedItem[];
```

Inputs are plain data. Outputs are plain data. No side effects, no IO. The function runs in the UI in sprint 1. In later sprints it can move to any side without contract changes; this is a location-free concern because it is stateless.

The default algorithm is the `boost × (fuzzy · Wf + relevance · Wr)` form already used in the current mention popup, generalized across snapshot and query items. Each item carries its own `boost` (from its source) and `relevance` (from its metadata).

### Select actions

When the user selects an item, dispatch is routed by the item’s `type`:

| `type` prefix | Action |
|---------------|--------|
| `file` | Register as `FileAttachment` on the pending message (package command) |
| `tab` | Attach tab context to the message (package command; payload is host-originated) |
| `workspace` | Insert workspace reference (package command) |
| `skill` | Insert skill invocation (slash popup only; package command) |
| `cmd:pkg:<id>` | Dispatch package command |
| `cmd:host:<id>` | Dispatch host command (e.g. `openSettings`, `openExternal`) |

Type strings are documented; no closures or callbacks are embedded in items. Every item is serializable.

### Graceful degradation

| Missing | Effect |
|---------|--------|
| Host tab snapshot | Tabs do not appear in mention popup. Rest works. |
| Host slash-command snapshot | No host commands in slash popup. Built-ins and skills work. |
| Package query provider (`files`) | Files cannot be searched. Snapshot-based filename completion for pending-diff / recent-edit files can still fall back via `recentEdits` + `pendingDiffs` snapshots. |
| Ripgrep binary missing or unspawnable | `files` query provider surfaces an error; UI indicates “file search unavailable.” |

### Split-Brain preview (sprint 5+)

- Snapshots stay on their natural side. Tabs snapshot stays user-machine; skills snapshot stays with the remote agent. Each is small and changes slowly, so mirroring over the wire is cheap.
- Query providers run on the side with their backing data. `files` executes ripgrep user-machine-side regardless of where the package runs; the package-side query implementation becomes a thin wire-call to the user-machine adapter.
- Ranking remains a pure function in the UI. It receives already-fetched items and produces an ordered list. No sprint-5 refactor needed.

This structure keeps the per-keystroke critical path short: client-side filtering of snapshots, one debounced call per active query provider. No round-trip through the package for static catalog data.

---

## Agent State Store

### Purpose

The AgentStore replaces Karton as the canonical backend state bus for agent-related state.

Karton remains as a UI transport and mirrored state representation in the Electron browser app.

### Requirements

The store must support:

- get current state;
- Immer-style updates or equivalent immutable updates;
- subscriptions;
- command registration;
- command dispatch;
- parent/child agent relationships;
- mirrored state shape compatible with current Karton UI expectations;
- future event emission without redesign.

### Sketch

```ts
export class AgentStore {
  get(): AgentSystemState;

  update(recipe: (draft: AgentSystemState) => void): void;

  subscribe(listener: (state: AgentSystemState) => void): () => void;

  registerCommand<Args, Result>(
    name: string,
    handler: CommandHandler<Args, Result>,
  ): () => void;

  dispatch<Args, Result>(
    name: string,
    ctx: CommandContext,
    args: Args,
  ): Promise<Result>;
}
```

### State shape

The exact state should be written as types before implementation. It should roughly mirror current agent/toolbox slices:

```ts
export interface AgentSystemState {
  agents: {
    instances: Record<string, AgentInstanceState>;
    activeAgentId?: string | null;
    historyList?: AgentHistoryEntry[];
  };

  toolbox: Record<string, ToolboxAgentState>;
}
```

`AgentInstanceState` should include current `AgentState` fields:

- title;
- title lock;
- working/idling state;
- history;
- queued messages;
- active model ID;
- pending approvals (the runtime queue of approval requests from the SDK — not the policy decision, which is host-owned; see D22);
- serialized input state;
- token usage;
- runtime error;
- unread marker;
- usage warning;
- parent agent ID;
- child agent IDs or relationship metadata;
- persistence/runtime status as needed.

`ToolboxAgentState` should include current UI-consumed toolbox data such as:

- workspace mounts;
- pending file diffs;
- edit summaries;
- sandbox stream state;
- pending files;
- active questions if currently represented under toolbox;
- any state currently read by UI, pages-api, or window-layout.

### Why mirror instead of redesign

The store deliberately keeps current state shapes close to existing Karton shapes. This is not the final architecture, but it reduces regression risk.

After extraction, the state can be normalized and the final semantic event stream can be introduced.

### Persisted vs ephemeral state

The state shape distinguishes persisted from ephemeral fields so resume-after-restart behavior stays exactly as today.

**Source of truth:** `packages/agent-core/src/store/state-annotation.md`. The doc carries the field-by-field persistence map, the intentional Karton deltas (D14 `RequiredModelCapabilities` and `ShellSessionSummary`, and the D14-style narrowing of `toolApprovalMode` post-Phase 6), and the child-agent invariants above.

Summary:

- **Persisted per agent** (round-trips through SQLite): history, title, title lock, active model ID, tool approval mode, input state, usage tallies, parent/child relationships, mount list. The persistence column and classifier for tool approval remain host-owned (D22); only the field location moved into core state.
- **Ephemeral per agent** (process-lifetime only, rebuilt on resume): working/idling flag, pending approvals, pending user question, pending sandbox/shell outputs, active app, pending app message. `pendingFileDiffs` and `editSummary` are host-side-derived on load from the diff-history side table.

`@persistence` JSDoc tags on every field in `packages/agent-core/src/store/state.ts` and `packages/agent-core/src/types/agent.ts` carry the same information at the type level. A compile-time parity assertion at `apps/browser/src/shared/karton-contracts/ui/agent-core-parity.ts` enforces that the package state shape stays in sync with the Karton `AppState.agents` / `AppState.toolbox` slices — including the three bridged deltas.

---

## Environment Snapshot Orchestrator

Canonical types and capture live under `packages/agent-core/src/env/` (see **D23**). This section documents the **implemented** surface so the older generic-provider sketch is not mistaken for shipping code.

`EnvironmentSnapshotOrchestrator` (`env/orchestrator.ts`) registers one provider per `EnvironmentSectionKey` (a `keyof FullEnvironmentSnapshot`). Each provider implements:

```ts
export interface EnvironmentProvider<
  K extends keyof FullEnvironmentSnapshot = keyof FullEnvironmentSnapshot,
> {
  readonly sectionKey: K;
  getSnapshot(
    agentInstanceId: string,
  ): Promise<FullEnvironmentSnapshot[K]> | FullEnvironmentSnapshot[K];
}
```

`captureSnapshot(agentInstanceId)` awaits every provider, assembles a `FullEnvironmentSnapshot`, and uses `ENVIRONMENT_SECTION_ORDER` as the authoritative ordering contract (changing it requires coordinated renderer and golden-test updates). Missing providers are a hard error at capture time.

### Provider populations

**Package-owned (`packages/agent-core/src/env/providers/`).** Mount list, diff summary, `AGENTS.md` / `WORKSPACE.md` content, enabled skills, plans, logs — each module owns one `sectionKey` listed in D23.

**Host-owned (`apps/browser/src/backend/env-providers/`).** Browser tabs, shell sessions, sandbox session id, active mini-app, log-ingest metadata, browser session id. Implementations bind host services; slice types still come from `packages/agent-core/src/env/types.ts`.

### Render pipeline

Sparsification, effective snapshot resolution across message history, and `renderFullEnvironmentContext` live in `packages/agent-core/src/env/changes/` and `packages/agent-core/src/env/renderer.ts`. They consume typed snapshots attached to user messages as `metadata.environmentSnapshot`.

### Rules

- At most one registered provider per `sectionKey`; re-registration replaces the previous entry.
- Host wiring should register the full provider set before any agent turn calls `captureSnapshot`.
- `getSnapshot` should return empty or neutral typed slices for idle subsystems rather than throwing; unexpected throws still fail the capture await.
- Prompt XML output must stay stable for stable inputs (snapshot / golden coverage per R10).

### On-disk compatibility

D15 requires unchanged SQLite columns and JSON field names. Persisted user metadata still uses `environmentSnapshot` with the same nested keys as before extraction; Phase 8 tightened compile-time typing without introducing an `environmentPayload` rename (R11).

---

## KartonBridge

The browser app should implement a bridge that:

1. subscribes to AgentStore changes;
2. mirrors agent/toolbox slices into existing Karton state;
3. registers existing Karton procedure handlers;
4. forwards procedure calls to AgentStore commands;
5. maps Karton `callingClientId` into `CommandContext.callerId`;
6. preserves existing UI behavior.

Conceptually:

```txt
UI -> Karton procedure -> KartonBridge -> AgentStore.dispatch()
AgentStore.update() -> KartonBridge -> uiKarton.setState() -> UI
```

Do not let package code import Karton.

Do not let package code call `uiKarton.setState()`.

### Karton contract / command registry drift

The browser `KartonContract['serverProcedures']` is a strictly typed surface. After extraction, procedure names and signatures exist both in the Karton contract and as `AgentStore.registerCommand` names inside the package. The type systems cannot connect these automatically without pulling Karton into the package.

Sprint 1 policy:

- Accept drift. The bridge performs a typed mapping per procedure.
- Add a small CI check that lists Karton procedures under `agents.*` and `toolbox.*` and asserts each maps to a registered command name; fail the build if one is missing.
- When adding a new command, update both sides and the CI list in one commit.

This avoids a bigger refactor and keeps the bridge auditable.

### Phase 1c locked decisions

Phase 1c builds the bridge infrastructure in `apps/browser` and migrates exactly one Karton procedure end-to-end without moving any state ownership out of Karton. The following decisions are locked:

- **D-KB-1. Slice-by-slice migration, strict ownership.** For any given procedure/state field, either Karton is canonical OR `AgentStore` is canonical — never both at once. The bridge direction is derived from that ownership. In Phase 1c, all state stays Karton-canonical; only command routing moves.
- **D-KB-2. Package-pure initial state.** `@stagewise/agent-core` exports a pure `createInitialAgentSystemState()` factory that returns empty `agents.instances` and empty `toolbox` maps. The host seeds per-agent entries into the store when it hydrates agents (later phase). No Karton-shape import in the factory.
- **D-KB-3. Caller-id taxonomy.** Opaque strings, with these stable values used by the bridge: `ui:main` (the Electron UI Karton connection; default for inbound Karton procedures), `pages-api` (the in-page toolbar Karton connection; reserved), `system` (host-originated dispatches; reserved), `agent:<instanceId>` (an agent dispatching a command on behalf of itself; reserved).
- **D-KB-4. Error propagation.** `CommandRegistry.dispatch` rejections propagate unchanged. The bridge's Karton procedure wrapper catches them and rethrows `new Error(message)` with the original `.name` preserved, so Karton's existing error transport is unchanged for the UI. No structured `{code, details}` envelope in Phase 1c.
- **D-KB-5. Drift guard.** A hardcoded list of migrated procedure names lives in `apps/browser/src/backend/services/agent-core-bridge/contract-map.ts`. At bridge `attach()` time, iterate the list and assert `registry.has(name)` for every entry. Missing handler → throw `BridgeDriftError` on startup. Adding a new command requires updating the list in the same commit.
- **D-KB-6. Bridge owns Karton handler ownership.** Procedures registered via the bridge MUST NOT also be registered by the legacy service. The migration step for `toolbox.dismissActiveApp` removes its existing `uiKarton.registerServerProcedureHandler(...)` call from `ToolboxService` — the bridge becomes the sole registrar. Double-registration is undefined behaviour in Karton.

### Pages-API consumer

The in-page toolbar has its own contract under `apps/browser/src/shared/karton-contracts/pages-api/*` and consumes agent diffs, agent identities, and mount state. It is a second independent consumer of agent state, not a special case of the Karton bridge.

Sprint 1 rule:

- Pages-api wiring in `apps/browser/src/backend/wiring/pages-*` subscribes to AgentStore via the same `subscribe` API the KartonBridge uses.
- Pages-api owns its own state shape and its own `callerId` space for commands.
- Verification must include pages-api smoke tests alongside main-UI smoke tests (see Phase 10).

---

## Commands

The package should expose a command registry rather than direct Karton procedures.

Representative commands:

- `agents.create`
- `agents.resume`
- `agents.delete`
- `agents.archive`
- `agents.sendUserMessage`
- `agents.sendToolApprovalResponse`
- `agents.stop`
- `agents.flushQueue`
- `agents.clearQueue`
- `agents.deleteQueuedMessage`
- `agents.revertToUserMessage`
- `agents.replaceUserMessage`
- `agents.retryLastUserMessage`
- `agents.updateInputState`
- `agents.updateActiveModelId`
- `agents.setTitle`
- `agents.getHistoryList`
- `agents.getStoredInstance`
- `toolbox.mountWorkspace`
- `toolbox.unmountWorkspace`
- `toolbox.acceptHunks`
- `toolbox.rejectHunks`
- `toolbox.acceptAllPendingEdits`
- `toolbox.getEditedFilePaths`
- question/interaction commands currently owned by toolbox user-interaction tools

The exact command list should be derived from current `AgentManagerService.registerKartonHandlers()`, `DiffHistoryService.initialize()`, and `MountManagerService.initialize()`.

---

## Tool Architecture

### Descriptor

The agent uses the AI SDK `Tool` / `ToolSet` types directly. The package does **not** define its own tool descriptor, wrapper type, metadata side-channel, or middleware abstraction.

- `AgentMessage` and `AgentState` are generic over `TTools extends ToolSet = ToolSet` so call sites that care about concrete tool inference can parameterize, while everything else defaults to the open `ToolSet`.
- `streamText({ tools })` consumes the merged tool set unchanged. The agent's runtime seam is just "accept a `ToolSet`, run the ReAct loop."

### Tool populations

1. **Universal built-in tools (package-owned).**
   - File CRUD: `read`, `ls`, `glob`, `grepSearch`, `mkdir`, `write`, `multiEdit`, `delete`, `copy`.
   - Defined inside `packages/agent-core`. They call the package's internal fs module (backed by `node:fs/promises`; see D24) plus — for file-mod tools — the package-owned `DiffHistoryService` passed in at construction time.
   - File-mod tools (`write`, `multiEdit`, `delete`, `copy`) perform their own diff-history tracking internally: they read the pre-state via the fs module, execute the write, and call `diffHistory.registerEdit({ path, before, after })` before returning. This replaces the current `wrapFileModifyingTool` layer in `ToolboxService` — the same logic, now inside the tool definition itself.
2. **Host-provided tools.**
   - Shell, sandbox, browser/CDP, LSP diagnostics, `askUserQuestions`, credential-backed tools, and any future MCP / plugin tools.
   - Defined entirely in host code, co-located with their implementations. The host constructs each `Tool` with a complete `execute` (and, when needed, `needsApproval`) before registration.
   - The package sees only the final `Tool` instance and does not know what subsystem backs it.

The host composes the final `ToolSet` handed to the agent:

```ts
const tools: ToolSet = {
  ...makeUniversalTools({
    agentInstanceId,
    hostPaths,
    mountManager,
    diffHistoryService,
    mutations,
  }), // from @stagewise/agent-core; uses the package fs proxy
  executeShellCommand, // host-owned, built against host-internal shell subsystem
  executeSandboxJs, // host-owned, built against host-internal sandbox subsystem
  askUserQuestions, // host-owned, built against host-internal user-interaction surface
  // ...browser, lsp, credential-backed tools, etc.
};
```

Phase 7 / toolbox-core implementation is complete. The universal tools now live under `packages/agent-core/src/services/toolbox/` and are exported through `makeUniversalTools(deps)`. The browser `ToolboxService` remains the composer: it delegates `read`, `ls`, `glob`, `grepSearch`, `mkdir`, `write`, `multiEdit`, `delete`, and `copy` to the package toolset, while shell, sandbox, browser, LSP diagnostics, research, credentials, and user-interaction tools stay host-owned.

The package-side dependency surface is intentionally narrow: `agentInstanceId`, `HostPaths`, the core mount-manager lookup interface, optional static mounts, `DiffHistoryService`, optional logger, and optional file-mutation callbacks for host LSP synchronization. No browser-only service (`ClientRuntimeNode`, Karton, sandbox, shell, window layout, or LSP service) crosses into `@stagewise/agent-core`.

Intentional implementation detail: `glob` and `grepSearch` are currently package-owned filesystem traversal/search implementations over resolved mounts rather than host-runtime calls. They preserve the public tool names, schemas, caps, and mount-prefix contract; future replacement with a ripgrep-backed helper remains localized to the toolbox module if exact search behavior needs to converge further.

### Approval

Tool approval is host-owned. See D22 for the full locked decision. Short version:

- **Preference** (`'alwaysAsk' | 'alwaysAllow' | 'smart'`, matching the shipped schema in [](path:w787f/apps/browser/src/shared/karton-contracts/ui/shared-types.ts)) is persisted per agent. Post-Phase 6 it lives on `AgentState.toolApprovalMode` (`string` in the core; narrowed to the branded union on the host, same pattern as `activeModelId`). Agent-core carries the field value but never interprets it — the classifier and policy logic remain host-owned.
- **`needsApproval`** is populated at tool-registration time by the tool's owner. Host tools: host sets it directly. Universal tools: agent-core factories return naked `Tool` objects; host wraps each one and assigns `needsApproval` according to the current preference.
- **`'smart'`** → host-owned classifier runs inside `needsApproval: (input, ctx) => boolean | Promise<boolean>`. Only the `boolean` decision crosses into agent-core.
- **Agent-core behavior**: inert. Receives the finished `ToolSet`, hands it to `streamText`, passes the SDK's native `'approval-requested'` / `'approval-responded'` parts through the event stream. No package-side approval state machine.
- **Re-composition on preference change**: host rebuilds the `ToolSet` and hands it in on the next turn. Agent-core must not cache a `ToolSet` in a way that prevents re-registration.

### Diff-history (file-mod tools)

Diff-history is a package-owned Tier 2 service (SQLite + LRU, same schema and blob layout as today — see D9, D15). It is **not** a host capability and the host exposes no `snapshot.capture` / `snapshot.readSnapshot` surface.

The flow for a file-mod tool call:

1. Tool reads `before = await fs.readFile(path)` (or `null` if missing), using the package's internal fs module.
2. Tool performs its write via the same module (`writeFile` / `rm` / `rename`).
3. Tool calls `diffHistory.registerEdit({ toolCallId, path, before, after })`.
4. `DiffHistoryService` stores the keyframe/patch in its own SQLite DB at `host.paths.diffHistoryDbPath()` with blobs at `host.paths.diffHistoryBlobsDir()`.

External (non-tool) changes to workspace files are captured by the diff-history file watcher, which is owned by the package and uses `node:fs.watch` via the internal fs module. This matches today's behavior.

This keeps the "capture pre-state, execute, record diff" logic entirely inside the package. No `effects` metadata, no middleware chain, no host-side snapshot abstraction.

---

## Undo and Revert Semantics

The chosen model is hybrid:

- conversation rewind is agent-owned;
- file state restoration is backed by package-owned diff-history writing through `node:fs` (via the package's internal fs module — see D24);
- UI/client undo is not assumed to exist;
- ACP/editor clients may degrade to editor-native undo where full file restore is unavailable.

`DiffHistoryService` lives inside the package and owns operation tracking, keyframes, patches, and restoration. The host only provides the DB/blob directory paths via `host.paths` (see D24 — no filesystem capability).

When reverting to a user message:

1. host/client sends a revert command;
2. agent trims conversation state to the target message;
3. agent identifies relevant tool calls after that message;
4. `DiffHistoryService` restores file state for those tool calls by writing reconstructed contents through the package's internal fs module (`writeFile` / `rm` / `rename`);
5. agent updates/mirrors state so UI reflects the revert.

Sandbox scripts are a special case. Sandbox execution can perform opaque arbitrary file writes that bypass the package's file-mod tools; those writes are only captured if the sandbox's isolated filesystem layer lands bytes on the real filesystem so the diff-history watcher (`node:fs.watch` via the package's internal fs module) sees them. Sandbox-initiated mutations should be treated as less reliably revertible than tool-initiated mutations. This is communicated to the user in the UI when relevant — not via tool-level metadata.

---

## Plans (no mode system)

The agent has exactly one operating mode. There is no `chat` vs `plan` mode, no `switch_mode` tool, and no ACP `session/request_permission` projection for mode transitions. See D21.

Planning, previewing, debugging, and similar "modes of work" are implemented as **slash commands** — same pattern as today. A slash command expands into a scoped instruction + tool-availability shape for the next user turn; it does not flip a long-lived state flag on the agent.

Environmental requirements for specific slash commands (e.g. a debug server for `/debug`) are provided by the host via existing capability surfaces. The agent-core holds no knowledge of which slash commands a given host supports beyond what the host-provided tool set exposes.

Plans themselves remain first-class: plan files in `plans/` are read/written by the agent through the universal file-mod tools, and plan-state (active plans, progress) is surfaced in the environment snapshot. This is orthogonal to modes.

---

## Mentions and Resources

ACP represents mentions by embedding resource content blocks in user prompts. The client resolves resources; the agent receives structured references.

Stagewise currently has richer mention/resource metadata, including:

- file mentions;
- tab mentions;
- workspace mentions;
- attachments;
- text clips;
- DOM element snapshots;
- environment snapshots.

The internal model should remain richer than ACP. Later ACP adapters can project this richer structure into ACP-compatible messages, with known lossiness.

Sprint 1 should avoid designing the ACP projection, but must not collapse internal metadata into ACP shapes.

---

## Persistence Strategy

### Current decision

SQLite/LibSQL stays inside the agent package for local Node/Electron usage.

The host provides paths. The package owns:

- schema;
- migrations;
- query logic;
- DB file creation;
- attachment blobs;
- plan/log files under host-provided directories.

### Rationale

SQLite is portable across Electron, CLI, Docker, CI, and local Node environments. Abstracting storage behind a generic `StorageCapability` in sprint 1 would add complexity without current benefit.

### Future

Cloud/multi-tenant use may later introduce:

- Postgres;
- object storage;
- tenant-aware DB adapters;
- remote checkpoint stores.

Do not design these prematurely in sprint 1.

---

## Graceful Degradation

Most former "host capability" slots are now either host-registered tools, host-registered environment providers, or host-internal details. Absence simply means the host did not register the corresponding surface.

| Missing surface | Effect |
| --------------- | ------ |
| Host does not register shell tool | No shell execution available. `shells` env provider also typically absent. |
| Host does not register sandbox tool | No sandbox execution available. `sandbox` env provider typically absent. |
| Host does not register browser / CDP tools | Browser tools unavailable. `browser` env provider typically absent. |
| Host does not register LSP / `getLintingDiagnostics` tool | Diagnostics tool unavailable. Package freshness policy becomes a no-op. |
| Host does not register `askUserQuestions` tool | Structured questions unavailable. Agent proceeds without asking. |
| Host does not register credential-backed tools | Those tools unavailable; related features error with a clear missing-surface message. |
| Host does not register env provider for id `X` | No section for `X` in rendered environment snapshot (same path as before). |
| `host.models.get` missing or failing for a requested model | Required; agent cannot run model steps without model access. Surfaced as a runtime error on the agent. |

Missing optional surfaces must not crash the agent package at initialization.

---

## Implementation Plan

### Phase 0: Pre-spikes

Before full migration, perform these spikes:

#### S1. AgentStore to KartonBridge mirror

Move one small slice, e.g. workspace mounts, into a toy AgentStore and mirror it to Karton. Verify existing UI still updates correctly.

Failure here means the bridge strategy needs revision.

#### S2. Host paths for packaged Electron

Verify that `pluginsDir`, `builtinSkillsDir`, data dirs, temp dirs, plans/logs dirs, and ripgrep base dir can all be supplied correctly from the Electron host in dev and packaged modes.

#### S3. AI SDK streaming from package

Verify `streamText`, `readUIMessageStream`, and current AI SDK message streaming work unchanged when invoked from code imported from `packages/agent-core`.

#### S4. Full AgentSystemState type — **complete**

Write the full store state shape as TypeScript types and diff it against current Karton `agents` and `toolbox` slices. This should happen before large code movement.

Mark each field as persisted vs ephemeral (see D15, persisted/ephemeral distinction). Include child-agent relationships.

**Resolution:** landed as `packages/agent-core/src/store/state.ts` + `packages/agent-core/src/types/agent.ts` with `@persistence` tags on every field, a full annotation reference at `packages/agent-core/src/store/state-annotation.md`, and a host-side compile-time parity assertion at `apps/browser/src/shared/karton-contracts/ui/agent-core-parity.ts`. The three bridged deltas (D14 `RequiredModelCapabilities`, D14 `ShellSessionSummary`, D22 `toolApprovalMode` overlay) are explicitly encoded in the assertion; any future Karton drift trips the typecheck.

#### S5. Shared-type move dry run

On a scratch branch, move `apps/browser/src/shared/karton-contracts/ui/agent/*` into `packages/agent-core/src/types/` with thin re-export shims left behind. Run typecheck and biome. If clean, this becomes Phase 1a (below). If not, adjust the shim strategy before doing anything else.

### Phase 1: Package scaffold

Create `packages/agent-core` with:

- package manifest;
- TypeScript config;
- build config matching monorepo patterns;
- public `src/index.ts`;
- initial host types;
- no behavioral changes.

### Phase 1a: Shared-type move

Move agent domain types listed in D14 into `packages/agent-core/src/types/`. Replace the original files under `apps/browser/src/shared/karton-contracts/ui/agent/*` with re-export shims that forward from `@stagewise/agent-core`. Touch no behavior. Typecheck, biome, and tests must remain green. This phase lands in its own PR before any service moves.

### Phase 2: Host interface and browser implementation

Define the host interfaces in the package.

Implement `BrowserAgentHost` in `apps/browser` using current services and Electron APIs.

Replace direct `utils/paths.ts` use near agent-owned code with host paths.

- Phase 2 complete: `@stagewise/agent-core/host` now exports the full `AgentHost` surface (`HostPaths`, `HostModels`, `Logger`, `TelemetrySink`). `apps/browser` supplies a concrete `BrowserAgentHost` composed of four thin adapter factories (`createBrowserHostPaths`, `createBrowserHostModels`, `createBrowserTelemetrySink`, and an identity-passed `Logger`). `createAgentCoreBridge` takes the host in its context and exposes it on the returned handles so later service moves thread paths/models/logger/telemetry through a single object. `DiffHistoryService` is the pilot service that consumes `host.paths` via constructor injection; every other service keeps its `@/utils/paths` imports until its own migration phase (Phase 4+), deliberately — each later move is a focused PR instead of a combined multi-service refactor.

### Phase 3: AgentStore and KartonBridge

Implement package-owned AgentStore.

Implement browser-side KartonBridge.

Mirror current agent/toolbox slices to Karton.

Forward Karton procedures to AgentStore commands.

- Phase 1c complete: bridge infrastructure (`AgentCoreBridge`, `BridgeDriftError`, `MIGRATED_PROCEDURES` contract map, `registerToolboxHandlers`) is in place, wired at host boot, and routes exactly one procedure (`toolbox.dismissActiveApp`) through `CommandRegistry.dispatch`. State ownership remains Karton-canonical pending Phase 1d.
- Phase 1d complete: `toolbox[agentId].activeApp` and `toolbox[agentId].pendingAppMessage` are now `AgentStore`-canonical. `AgentCoreBridge.attach()` installs a per-field diff subscriber that mirrors only these two slices into Karton, preserving every non-migrated toolbox field. Both `toolbox.dismissActiveApp` and `toolbox.clearPendingAppMessage` route through `CommandRegistry`, and `SandboxService` writes these fields exclusively through an injected `ActiveAppStateController`.

### Phase 4: Move persistence and support services — completed

Move low-level agent-owned services/utilities:

- attachment blob handling;
- agent persistence DB;
- file-read cache;
- processed image cache if agent-owned;
- asset cache if agent-owned;
- plan/log readers as needed.

Keep behavior unchanged.

Phase 4 complete: all listed services (minus `asset-cache`, which stays host-owned until the stagewise-auth tool-capability surface is formalized in Phase 7) now live inside `@stagewise/agent-core`. Relocations:

- `packages/agent-core/src/services/attachments/` — six free functions (`writeBlob`, `readBlob`, `readBlobStream`, `deleteAgentBlobs`, `blobExists`, `getAgentBlobDir`, `getBlobPath`) parameterized on `HostPaths`, replacing `apps/browser/src/backend/utils/attachment-blobs.ts`.
- `packages/agent-core/src/services/agent-persistence/` — `AgentPersistenceDB.create({ host, logger })` resolves `host.paths.agentDbPath()` internally; `StoredAgentInstance` / `NewStoredAgentInstance` / `ToolApprovalMode` schemas ship from core. Migrations and `schema.sql` moved as-is.
- `packages/agent-core/src/services/file-read-cache/` — `FileReadCacheService.create({ host, logger })` uses `host.paths.fileReadCacheDbPath()`; `buildCacheKey` remains static. The single host call site (`BaseAgent`) now receives the instance through the `AgentCoreBridge` boot path.
- `packages/agent-core/src/services/processed-image-cache/` — includes the relocated `image-processor.ts` (as `process-image.ts`) and uses `host.paths.processedImageCacheDbPath()`. `sharp` is declared as a core dependency and kept `external` in `build.js`.
- `packages/agent-core/src/file-read-transformer/` — top-level (not under `services/`) since it is the agent-loop context pipeline consumed by both `BaseAgent` and future file tools. `web-tree-sitter` and `@vscode/tree-sitter-wasm` join `sharp` as core native deps; `BlobReader` is now a structural type defined inside the transformer. `resolveMountedPath` / `populatePathReferences` take the host.
- `packages/agent-core/src/plans/` and `.../logs/` — `readPlans` / `readLogChannels` moved out of `apps/browser/src/backend/agents/shared/prompts/utils/`. The co-located `parsing.ts`, `ownership.ts` (plans), and `ownership.ts` (logs) came from the shared-module consolidation below.
- `packages/agent-core/src/ast/` — `types.ts` and `language-map.ts` moved out of `apps/browser/src/shared/ast/`.

New `HostPaths` methods: `fileReadCacheDbPath()`, `processedImageCacheDbPath()`. The browser adapter delegates to `getDbPath('file-read-cache' | 'processed-image-cache')`; the on-disk layout is unchanged.

No shims. Every `@shared/ast/*`, `@shared/plan-parsing`, `@shared/plan-ownership`, `@shared/log-ownership`, `@/services/file-read-cache`, `@/services/processed-image-cache`, `@/utils/attachment-blobs`, `@/agents/shared/base-agent/file-read-transformer`, and `@/agents/shared/base-agent/image-processor` import in `apps/browser/src` was rewritten to the matching `@stagewise/agent-core/...` subpath export, and the host-side originals were deleted. All `node:fs` / `node:fs/promises` access inside the migrated modules routes through the `@stagewise/agent-core/fs` proxy so the `noRestrictedImports` Biome guard stays enforceable.

All core fs usage continues through the centralized proxy (`packages/agent-core/src/fs/`), and the `noRestrictedImports` Biome guard prevents direct `node:fs` imports inside the package.

Tests: 332 passing in `@stagewise/agent-core` (from 170 pre-Phase-4), 690 passing in `apps/browser`. Full workspace typecheck (`preload`, `backend`, `ui`, `storybook`) green, Biome clean. Remaining work is the manual smoke test described in the plan (attachments, file mentions, restart/rehydrate, sharp + tree-sitter native-module loading under a packaged build).

### Phase 5: Move DiffHistoryService

Move `DiffHistoryService` into the package mostly as-is.

Replace direct Karton access with AgentStore updates/subscriptions.

Keep SQLite/LibSQL internal.

Maintain existing undo/revert behavior.

- Phase 5 complete: `DiffHistoryService` lives at `packages/agent-core/src/services/diff-history/` and is constructed by the host with `{ host, store }`. It writes `pendingFileDiffs` / `editSummary` through transactional `store.update(...)` calls (via `ensureToolboxEntry`) and subscribes to `AgentStore` for hydration/pruning — no `KartonService` dependency remains. `toolbox.acceptHunks` and `toolbox.rejectHunks` route through `AgentCoreBridge` and `CommandRegistry`, and the browser `FileDiffsStateController` shim plus its browser-side service directory have been deleted. Schema, migrations, and blob storage continue to resolve through `host.paths.diffHistoryDbPath()` / `diffHistoryBlobsDir()`, preserving existing DB compatibility. Remaining work is a manual startup smoke-test against a pre-migration user-data directory.
- Phase 6 (agent instances ownership) complete: `agents.instances[id]` is now `AgentStore`-canonical. The per-instance write surface lives in `packages/agent-core/src/services/agent-manager/state-mutations/` ([](path:w787f/packages/agent-core/src/services/agent-manager/state-mutations/index.ts)) — a folder of pure `(store, agentInstanceId, args)` functions plus `upsertAgentInstance` / `deleteAgentInstance` / `getAgentInstance` / `setToolApprovalMode` CRUD. `AgentManager` calls them directly against its `AgentStore`. Hosts that need extra setters (browser's `setUnread`, `recordPendingApproval`) build them with the exported `updateAgentInstanceState(store, id, mutate)` helper — see `createHostAgentStateMutations` ([](path:w787f/apps/browser/src/backend/services/agent-core-bridge/state/agent-instances.ts)). A vitest guardrail in `state-mutations/store-mutation-guard.test.ts` fails any new direct `store.update(...)` call outside an explicit allowlist (state-mutations, diff-history, mounts/active-app controllers), pinning every agent-instance write to these utilities.

- Phase 7 (API narrowing) complete: the opaque `applyStateRecipe(agentInstanceId, recipe)` escape hatch has been replaced by the per-intent functions in `state-mutations/` (lifecycle / queue / history / approvals / streaming / metadata / simple buckets) covering every former `BaseAgent.state.set(recipe)` intent — hydrate, title/user-title updates, queue append/remove/clear/flush, history tool-part transitions (deny-all vs last-assistant), approval resolution, history replace/truncate, `inputState`/`activeModelId` writes, `beginStep` / `setIsWorkingFalse` / `recordStepError` (with `always` / `mark-unread` / `if-assistant-history` modes), usage recording, sandbox-attachment draining, environment-snapshot attachment, user and assistant path-reference merges, the stream-merge hot path (`mergeUIMessageStream`), `storeCompressedHistory`, and `setUsageWarning`. `AgentManager` builds a per-agent bound bundle via `bindStateMutations(store, agentInstanceId)` (inferred type `AgentStateMutations`); `BaseAgent` receives it as `{ get; commands; persist }`. The recipe channel, `applyStateRecipe`, and `BaseAgent.state.set` are deleted. Every state-mutation is serializable by shape and discrete enough to journal for checkpointing. The bridge forward-mirror in `AgentCoreBridge` projects the `agents.instances` branch into `uiKarton` via reference-identity diffing with per-id envelope reuse; legacy Karton readers observe unchanged shapes. `agents.markAsRead` is the only `agents.*` procedure routed through `CommandRegistry` today. The temporary Karton → AgentStore reverse-mirror that existed to unblock `DiffHistoryService` hydration has been removed. All persisted/service-owned `AgentSystemState` slices are now store-canonical, closing the last reverse-direction gap before the Sprint 6 Split-Brain cut. Per Phase 6's D22 amendment, `toolApprovalMode` is now promoted into `AgentState` in `@stagewise/agent-core` as `string` and narrowed to the branded `ToolApprovalMode` union on the host; the classifier, persistence column, and policy semantics stay host-owned.

### Phase 6: Move MountManagerService — completed

The mount registry, workspace-info readers (`readWorkspaceMd`, `readAgentsMd`, `getSkills`, `isGitRepo`, `getGitBranch`), chokidar-driven `.stagewise/WORKSPACE.md` refresh, `pickOwningWorkspace`, and `MentionSearchService` now live in `packages/agent-core/src/services/mount-manager/`. The core `MountManager` class accepts a `MountsStateController`, `Logger`, optional `TelemetrySink`, and a `MountManagerHostHooks` triad (`onWorkspaceAttached`, `onWorkspaceReleased`, `onMountsChanged`). All `node:fs` / `chokidar` access is routed through the `@stagewise/agent-core/fs` proxy.

The host-side `MountManagerService` ([](path:w787f/apps/browser/src/backend/services/toolbox/services/mount-manager/index.ts)) is now a thin composition shell that constructs the core, implements the three hooks to manage `ClientRuntimeNode` + `LspService` lifecycle and call `userExperienceService.saveRecentlyOpenedWorkspace`, and registers the three Karton procedures (`toolbox.mountWorkspace` with file-picker fallback, `toolbox.unmountWorkspace`, `toolbox.searchMentionFiles`).

File-picker behavior is resolved host-side before dispatch: when `toolbox.mountWorkspace` is invoked with `workspacePath === undefined`, the host shell calls `FilePickerService.pickDirectory()` and only then forwards the concrete absolute path into `MountManager.mountWorkspace`. Core only sees resolved paths.

The Karton mirror for `toolbox[agentId].workspace.mounts` continues through `MountsStateController` / `AgentCoreBridge`; `pages-api` and `window-layout` observe the unchanged shape. Tests: 181 in `@stagewise/agent-core`, 841 in `apps/browser`.

### Phase 7: Move Toolbox core — completed

Universal filesystem tool definitions and execution plumbing now live in `packages/agent-core/src/services/toolbox/`. The package exports `makeUniversalTools(deps)` and package-owned execute helpers for `read`, `ls`, `glob`, `grepSearch`, `mkdir`, `write`, `multiEdit`, `delete`, and `copy`.

The browser `ToolboxService` is now a host composition shell for toolbox concerns: it delegates universal tool names to `@stagewise/agent-core`, keeps platform-specific tools in `apps/browser`, and supplies the package with mount lookup, host paths, diff-history, static mounts, and optional file-mutation callbacks. The migrated browser file-modification tool implementations were removed; `getLintingDiagnostics` remains browser-owned because it depends on `LspService`.

Host-specific effects remain outside the package. Approval policy, shell execution, sandbox/CDP execution, browser console access, LSP diagnostics, user questions, credentials, research docs, sandbox callbacks, and Karton procedure ownership remain host-owned. Universal tools use the package fs proxy and the package-owned `DiffHistoryService` for edit registration.

### Phase 8: Move BaseAgent and concrete agents — completed

`BaseAgent`, `ChatAgent`, `WorkspaceMdAgent`, the chat system-prompt builder,
and agent prompt assets now live under `packages/agent-core/src/agents/`. The
environment snapshot orchestrator, typed `FullEnvironmentSnapshot`, core
providers, and renderer live under `packages/agent-core/src/env/` (D23 split);
host-only providers remain in `apps/browser/src/backend/env-providers/`.

Replace service imports with package-local imports or host interfaces.

**Split the environment-changes folder per D23 (done).** The orchestrator is
`packages/agent-core/src/env/orchestrator.ts` as `EnvironmentSnapshotOrchestrator`.
Package-owned providers are under `packages/agent-core/src/env/providers/`;
host-owned providers are under `apps/browser/src/backend/env-providers/`.

Host wiring registers its providers with the orchestrator before the
AgentManager creates its first agent. Provider registration order is fixed and
matches the section order in the rendered prompt.

Ensure child-agent spawning works.

### Phase 9: Move full AgentManager

Move `AgentManagerService` into the package.

Replace Karton handlers with package command registration.

Browser KartonBridge forwards existing procedures to these commands.

Ensure agent persistence, create/resume/archive/delete, send/retry/revert, and title generation all work.

Parameterize startup per D16. The Electron host passes `auto-create-default`; CLI/ACP skeletons (future) pass `none`.

### Phase 10: Verification

Run focused checks:

- browser app typecheck;
- affected package typecheck;
- diff-history tests;
- file-read/cache tests;
- sandbox tests if touched;
- path-equivalence assertion between Electron host and current `utils/paths.ts` (per R8);
- Karton-procedure-to-command coverage check (per "Karton contract / command registry drift");
- pages-api smoke test (per "Pages-API consumer"): toolbar receives agent diffs and mount changes after the bridge is live;
- upgrade-path smoke test: launch the build on a pre-migration user-data directory with existing agents and diff-history, confirm full readback;
- manual smoke test in Electron:
  - create agent;
  - mount workspace;
  - send message;
  - use read/write/multiEdit;
  - inspect pending diffs;
  - accept/reject hunks;
  - revert to prior message;
  - spawn workspace-md child agent;
  - use sandbox output/attachment;
  - use shell tool (including its smart-approval classifier path — host-internal);
  - restart app and resume persisted agent.

---

## Risk Register

### R1. AgentStore mirror regression

Existing UI and pages-api assume Karton state shape and timing. Mirroring must preserve both.

Mitigation: spike first; keep state shape close; avoid UI changes.

### R2. DiffHistory migration complexity

Diff-history is large, DB-backed, watcher-backed, and UI-coupled.

Mitigation: port as-is; replace only state access; keep tests passing.

### R3. Model provider wiring drift

Moving model construction to the host can accidentally break auth/BYOK/proxy routing.

Mitigation: host capability wraps existing ModelProvider behavior first; deeper cleanup later.

### R4. Mount flow behavior change

Moving file-picker responsibility to host can break UI mount actions.

Mitigation: KartonBridge/browser controller handles path selection before dispatching core mount command.

### R5. Type coupling to UI tool schemas

`AgentMessage` currently depends on concrete UI tool types.

Mitigation: keep current types for built-in tools in sprint 1; introduce an unknown/provided-tool fallback before runtime-provided tools become required.

### R6. Package import cycles

Moving services piecemeal may create cycles between `apps/browser`, `@shared`, and `packages/agent-core`.

Mitigation: move shared agent types into package or neutral shared package deliberately; do not import from `apps/browser` inside `packages/agent-core`.

### R7. Shared-type move breaks Karton contract at compile time

Moving agent domain types out of `@shared/karton-contracts/ui/agent/*` temporarily breaks every consumer unless the re-export shim is landed first.

Mitigation: do the type move in one PR that (1) adds types to `packages/agent-core/src/types/`, (2) replaces the old files with thin re-export shims, (3) leaves import paths in the rest of the monorepo unchanged. No behavior changes. Only after this lands do further migration phases begin.

### R8. Persistence path or schema regression

A subtle path change in `host.paths.*` or a schema tweak during the move can silently migrate users to empty state.

Mitigation: add an assertion test that compares `host.paths.*` output for the Electron host against the current `utils/paths.ts` output byte-for-byte; snapshot the current SQLite schemas and assert equivalence in CI for sprint 1.

### R9. Watcher / bridge timing regressions

Moving services while reworking state subscription can produce UIs that briefly show empty mount lists, missing diffs, or lost pending-question state immediately after create/resume.

Mitigation: enforce D19 sequencing; add smoke tests for create-then-immediately-inspect and mount-then-immediately-inspect flows.

### R10. Environment provider contract drift

Splitting env-snapshot composition into per-provider modules across the package/host boundary (D23) introduces two new failure modes: (a) the rendered system-prompt environment section changes shape unintentionally when capture or diff logic is rewritten; (b) host and package disagree on `EnvironmentSectionKey` coverage, producing missing sections or inconsistent persisted `metadata.environmentSnapshot` blobs.

Mitigation:

- Snapshot-test the render pipeline (`packages/agent-core/src/env/changes/*`, `env/renderer.ts`) against fixtures that mirror today's output byte-for-byte. Port or extend the existing `*.test.ts` coverage from the pre-migration `environment-changes/` tree alongside the new modules, preserving expectations.
- Add a golden-prompt test that boots a representative agent state and asserts the full rendered environment block is identical to the pre-migration baseline.
- Rely on `EnvironmentSnapshotOrchestrator.hasAllProviders()` / `missingSections()` (and host wiring discipline) so incomplete registration fails before user-visible turns; duplicate `sectionKey` registration overwrites — treat unintended overwrite as a wiring bug in review.
- Keep the on-disk `environmentSnapshot` key set and field name unchanged vs. today (see D23); Phase 8 keeps the same identifier in package types and Karton (no `environmentPayload` rename).

### R11. ~~Persisted `environmentSnapshot` field rename~~ (superseded)

An early draft proposed renaming `metadata.environmentSnapshot` to `metadata.environmentPayload` at the package boundary, with KartonBridge performing bidirectional mapping. **Phase 8 keeps `environmentSnapshot` everywhere** — package metadata Zod, AgentStore, SQLite JSON, and Karton contracts all use the same name, which minimizes D15 risk.

Mitigation for the abandoned rename is unnecessary. Bridge and persistence code must not strip or alias this field. Resume tests should still assert that hydrated history preserves non-empty `metadata.environmentSnapshot` when present in legacy databases.

---

## Open Design Notes for Later Sprints

These are intentionally not solved in sprint 1:

1. Final semantic event-stream taxonomy.
2. ACP adapter shapes and lossy projection rules.
3. Stdio binary protocol.
4. Checkpoint schema and session resume format.
5. Remote/cloud host capability protocol.
6. Storage abstraction for Postgres/object storage.
7. Tool registry for runtime-provided MCP/editor tools.
8. Cleanup of large services after extraction.
9. Normalized state shape replacing Karton-compatible mirror shape.
10. `ToolDeclaration` protocol for wire-serialized tool registration (Sprint 2+): a declaration shape with `approval: { kind: 'always-allow' | 'always-ask' | 'host-callback' }` and `execute: { kind: 'host-callback' | 'package-builtin' }`. Agent-core materializes real `Tool` objects from declarations, stubbing `needsApproval` and/or `execute` as host-side RPCs when `kind === 'host-callback'`. This covers both universal and host tools under one mechanism. The declaration kinds are deliberately decoupled from the host-facing preference strings (`'alwaysAsk' | 'alwaysAllow' | 'smart'`) — the host is free to collapse `'smart'` into `'host-callback'` when declaring tools over the wire.
11. `ProviderDeclaration` protocol for wire-serialized environment-provider registration (Sprint 2+), analogous to `ToolDeclaration`. Split-brain hosts would tunnel capture and/or render work instead of calling in-process `getSnapshot` / `env/changes` directly. Wire payloads remain JSON objects that deserialize through the same `environmentSnapshotSchema` / `FullEnvironmentSnapshot` types so D15 replay stays stable; the exact declaration surface (ids vs `sectionKey`, callback kinds) is intentionally deferred until remote-agent constraints are concrete.
12. `FileSystemCapability` wire protocol for Split-Brain deployments (Sprint 5+). Sprint 1 uses `node:fs` directly through a centralized internal module (see D24); when agent-core runs server-side and user files live on a different machine, that module is replaced by a capability whose calls tunnel through the host adapter. The interface shape is intentionally deferred — it will be designed alongside the Sprint 5 remote-host work using the actual access patterns observed across Sprints 1–4 rather than guessed at up front. Constraints locked today: (a) no absolute paths in persisted data (already guaranteed by D24); (b) mount resolution stays inside agent-core; (c) the swap is localized to `packages/agent-core/src/fs/` and must not require changes at call sites.

---

## Definition of Done for Sprint 1

Sprint 1 is done when:

- `packages/agent-core` exists and owns the agent lifecycle and intrinsic services.
- `apps/browser` constructs a browser host implementation and imports the agent package.
- Agent domain types live in `packages/agent-core`; `@shared/karton-contracts/ui/agent/*` is a thin re-export shim.
- No code inside `packages/agent-core` imports Electron.
- No code inside `packages/agent-core` imports Karton.
- Agent-related canonical state lives in AgentStore, not in Karton.
- KartonBridge mirrors package state to current UI contracts.
- Pages-api wiring consumes AgentStore through the same subscribe API as KartonBridge.
- Existing UI behavior remains unchanged.
- Existing installs upgrade without data loss (persistence-compat test passes per D15/R8).
- Full AgentManager lifecycle is package-owned.
- AgentManager startup is host-parameterized (D16); Electron host preserves current behavior.
- Model construction is host-owned.
- Mount initiation is host-owned; core receives concrete paths.
- Sandbox is delivered as a host-registered tool using AI SDK native tool-output streaming; the host sandbox tool reads current mounts from `AgentStore` at execute-time.
- Ripgrep is host-provisioned (D17); package fails gracefully if the binary is missing.
- Environment snapshot composition is provider-driven (D23): the package ships `EnvironmentSnapshotOrchestrator`, typed `FullEnvironmentSnapshot` (`env/types.ts`), render/diff helpers (`env/renderer.ts`, `env/changes/*`), and package providers for `workspace`, `fileDiffs`, `agentsMd`, `workspaceMd`, `enabledSkills`, `plans`, `logs`; the Electron host registers providers for `browser`, `shells`, `sandboxSessionId`, `activeApp`, `logIngest`, `browserSessionId`. Slice values from host subsystems are still typed in core; only the host **services** are browser-specific.
- Rendered environment-prompt output is byte-identical to pre-migration baseline for a representative agent state (R10 golden test).
- Diff-history undo/revert continues to work.
- Browser app typecheck passes.
- Relevant tests pass.

---

## Summary

The main architectural problem is not that the agent imports Electron in many places. It does not. The deeper issue is that the browser backend currently uses Karton as a shared mutable state bus between agent services, toolbox services, diff-history, mount-manager, window-layout, and page/toolbar wiring.

Sprint 1 must therefore do more than move files. It must introduce an agent-owned state and command boundary, then adapt the current Electron/Karton app to that boundary.

The locked approach is:

```txt
packages/agent-core
  owns agent lifecycle, state, commands, toolbox orchestration, diff-history, persistence

apps/browser
  owns Electron, Karton transport, UI/window/page wiring, host capability implementations

KartonBridge
  mirrors AgentStore state to existing UI contracts and forwards Karton procedures to agent commands
```

This keeps the current product stable while creating the foundation for CLI, ACP, checkpointing, and future split-brain/cloud execution.