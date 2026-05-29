# `AgentSystemState` annotation

Authoritative reference for the shape, persistence, and parity of
`AgentSystemState` — the canonical in-memory state owned by
`AgentStore` in `@stagewise/agent-core`.

This document closes the SPEC's Phase 0 / S4 pre-spike. It has three
jobs:

1. Prove `AgentSystemState` matches the Karton `AppState.agents` and
   `AppState.toolbox` slices field-for-field, with every delta named and
   justified.
2. Classify every field as persisted vs ephemeral so slice migrations
   and resume-after-restart code have a single source of truth.
3. Lock the child-agent invariants (D13) so future slice migrations do
   not silently break the parent/child tree.

Companion compile-time assertion:
[](path:w787f/apps/browser/src/shared/karton-contracts/ui/agent-core-parity.ts).

---

## 1. Parity with Karton `AppState`

Source of truth for the current Karton shape: the `agents` and
`toolbox` slices of `AppState` in
[](path:w787f/apps/browser/src/shared/karton-contracts/ui/index.ts)
(lines 477–517). Source of truth for the package shape: sibling
[](path:w787f/packages/agent-core/src/store/state.ts).

`match` means byte-identical structural type after expanding aliases.
`delta` means a named, decision-backed difference. `missing` means an
unclosed gap.

### `AppState.agents.instances[id]` ↔ `AgentInstanceState`

| Karton field                | agent-core field            | Status | Notes                                                                                                                                                                 |
| --------------------------- | --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                      | `type`                      | match  | Both are `AgentTypes`; core enum re-exported into Karton via the agent-core types module.                                                                            |
| `canSelectModel`            | `canSelectModel`            | match  | `boolean` both sides.                                                                                                                                                 |
| `requiredModelCapabilities` | `requiredModelCapabilities` | delta  | Karton uses `ModelSettings['capabilities']`; agent-core uses the opaque `Record<string, boolean \| undefined>` per **D14**. Structurally identical at runtime. See §3. |
| `allowUserInput`            | `allowUserInput`            | match  |                                                                                                                                                                       |
| `parentAgentInstanceId`     | `parentAgentInstanceId`     | match  | `string \| null` both sides. Back-pointer used for tree reconstruction (D13, see §4).                                                                                 |
| `state`                     | `state`                     | match  | `AgentState` is structurally aligned; `toolApprovalMode` is store-canonical on the core shape (see §3.2). Karton still narrows the literal `ToolApprovalMode` union for UI. |

No missing or extra fields.

### `AppState.toolbox[id]` ↔ `ToolboxAgentState`

| Karton field                | agent-core field            | Status | Notes                                                                                       |
| --------------------------- | --------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `workspace.mounts`          | `workspace.mounts`          | match  | Both are `MountEntry[]` from `@stagewise/agent-core/types/metadata`.                        |
| `pendingFileDiffs`          | `pendingFileDiffs`          | match  | `FileDiff[]`. Karton re-exports `FileDiff` from `@stagewise/agent-core/types/diff-history`. |
| `editSummary`               | `editSummary`               | match  | `FileDiff[]`.                                                                               |
| `pendingUserQuestion`       | `pendingUserQuestion`       | delta  | Karton specializes the generic with `QuestionField`/`QuestionAnswerValue` (host-owned tool schema); agent-core keeps it generic. See §3. |
| `pendingSandboxOutputs`     | `pendingSandboxOutputs`     | match  | `Record<string, string[]> \| undefined`.                                                    |
| `pendingSandboxAttachments` | `pendingSandboxAttachments` | match  | `Record<string, AttachmentMetadata[]> \| undefined`.                                        |
| `pendingShellOutputs`       | `pendingShellOutputs`       | match  | `Record<string, string[]> \| undefined`.                                                    |
| `pendingShellSessionIds`    | `pendingShellSessionIds`    | match  | `Record<string, string> \| undefined`.                                                      |
| `shells`                    | `shells`                    | delta  | Karton uses `ShellSessionSnapshot[]`; agent-core uses `ShellSessionSummary[]` per **D14** (kept separate to avoid host imports). Structurally identical. See §3. |
| `activeApp`                 | `activeApp`                 | match  | Same object shape both sides.                                                               |
| `pendingAppMessage`         | `pendingAppMessage`         | match  | Same object shape both sides.                                                               |

No missing or extra fields.

---

## 2. Persistence map

Single table for every field in `AgentSystemState`, its persistence
class, where it is sourced when `resumeAgent` re-hydrates the instance,
and whether it is reset on resume.

Source of truth for row persistence:
[](path:w787f/apps/browser/src/backend/services/agent-manager/persistence/schema.ts)
(`agentInstances`, `agentMessages`) and the `storeAgentInstance` /
`getStoredAgentInstanceById` paths in
[](path:w787f/apps/browser/src/backend/services/agent-manager/persistence/db.ts).
Source of truth for rehydration:
`resumeAgent` in
[](path:w787f/apps/browser/src/backend/services/agent-manager/agent-manager.ts)
(lines 769–836).

### `AgentInstanceState` (top-level per-agent envelope)

| Field                        | Class          | Source on resume                                                                                                 | Reset on resume |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- |
| `type`                       | persisted-core | `agentInstances.type`.                                                                                           | no              |
| `canSelectModel`             | derived        | `AgentsMap[type].config.allowModelSelection` at `createAgent` time.                                              | recomputed      |
| `requiredModelCapabilities`  | derived        | `AgentsMap[type].config.requiredCapabilities`.                                                                   | recomputed      |
| `allowUserInput`             | derived        | `AgentsMap[type].config.allowUserInput`.                                                                         | recomputed      |
| `parentAgentInstanceId`      | persisted-core | `agentInstances.parent_agent_instance_id`. Back-pointer is the sole basis for tree reconstruction (see §4).      | no              |
| `state.*`                    | mixed          | See next sub-table.                                                                                              | per-field       |

### `AgentState` (per-agent reasoning state)

| Field                   | Class          | Source on resume                                                                                                                                              | Reset on resume                                           |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `title`                 | persisted-core | `agentInstances.title`.                                                                                                                                       | no                                                        |
| `titleLockedByUser`     | persisted-core | `agentInstances.title_locked_by_user`; falls back to `undefined` when null.                                                                                   | no                                                        |
| `isWorking`             | ephemeral      | Not stored. `resumeAgent` explicitly passes `isWorking: false` into `createAgent`.                                                                            | yes — always `false`                                      |
| `history`               | persisted-core | `agentMessages` side-table (keyed by `agentInstanceId, seq`). Legacy `agentInstances.history` JSON column retained for rollback only.                         | no                                                        |
| `queuedMessages`        | persisted-core | `agentInstances.queued_messages` (JSON).                                                                                                                      | no                                                        |
| `activeModelId`         | persisted-core | `agentInstances.active_model_id`, validated against the model provider registry. Falls back to "undefined" (→ default) when the model no longer exists.      | no (unless invalidated)                                   |
| `toolApprovalMode`      | persisted-core | `agentInstances.tool_approval_mode`; fail-closed to the host default when null.                                                                               | no                                                        |
| `pendingApprovals`      | ephemeral      | Not stored. `createAgent` initializes to `{}`; `resumeAgent` does not override.                                                                                | yes — always `{}`                                         |
| `inputState`            | persisted-core | `agentInstances.input_state` (JSON-encoded string).                                                                                                           | no                                                        |
| `usedTokens`            | persisted-core | `agentInstances.used_tokens`.                                                                                                                                 | no                                                        |
| `error`                 | ephemeral      | Not stored. Set by the runloop on failure.                                                                                                                    | yes — cleared                                             |
| `unread`                | ephemeral      | Not stored. Maintained by UI unread-marker logic.                                                                                                             | yes — cleared                                             |
| `usageWarning`          | ephemeral      | Not stored. Populated by the model provider on soft-limit proximity.                                                                                          | yes — cleared                                             |

As of Phase 6 (see §3.2), `toolApprovalMode` is store-canonical and
typed as `string` in `AgentState`; the host narrows the string union
via its `AgentState` overlay.

### `ToolboxAgentState` (host-projected per-agent toolbox slice)

None of the toolbox fields live on the agent row. Fields that survive
restart do so because a dedicated service re-derives them from its own
storage on load.

| Field                       | Class          | Source on resume                                                                                                                                                                            | Reset on resume         |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `workspace.mounts`          | persisted-core | Remounted via `MountManager.mountWorkspace(instanceId, path, permissions)` (core, `@stagewise/agent-core/mount-manager`) using `agentInstances.mounted_workspaces`. Host shell (`MountManagerService`) wraps it for file-picker + `ClientRuntimeNode`/LSP orchestration. The toolbox slice is populated via `MountsStateController` as a side effect. | no (recreated)          |
| `pendingFileDiffs`          | persisted-side | `DiffHistoryService` at `<userData>/stagewise/diff-history/data.sqlite` (`snapshots` + `operations` tables, plus on-disk blob dir).                                                         | no (recreated)          |
| `editSummary`               | persisted-side | Same DB as `pendingFileDiffs`; accepted-but-still-relevant diffs.                                                                                                                           | no (recreated)          |
| `pendingUserQuestion`       | ephemeral      | Not stored; in-flight `askUserQuestions` state.                                                                                                                                             | yes — cleared           |
| `pendingSandboxOutputs`     | ephemeral      | Not stored.                                                                                                                                                                                 | yes — cleared           |
| `pendingSandboxAttachments` | ephemeral      | Not stored. Note: the underlying attachment blobs at `<userData>/stagewise/agents/<id>/data-attachments/<blobKey>` *are* persisted — only the in-flight "pending" index is ephemeral.       | yes — cleared           |
| `pendingShellOutputs`       | ephemeral      | Not stored.                                                                                                                                                                                 | yes — cleared           |
| `pendingShellSessionIds`    | ephemeral      | Not stored; shell sessions do not survive restart.                                                                                                                                          | yes — cleared           |
| `shells.sessions`           | ephemeral      | Rebuilt from the host shell service's in-process session registry.                                                                                                                          | yes — rebuilt empty      |
| `activeApp`                 | ephemeral      | Not stored; mini-apps are live-process only.                                                                                                                                                | yes — cleared           |
| `pendingAppMessage`         | ephemeral      | Not stored; one-shot message bus entry.                                                                                                                                                     | yes — cleared           |

### Side-table storage summary

| Side-table / location                                                           | Owner                  | Backs                                                        |
| ------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| `agentInstances` (core row)                                                     | `AgentPersistenceDB`   | Most of `AgentState` + agent metadata.                       |
| `agentMessages` (side, keyed by `agentInstanceId, seq`)                         | `AgentPersistenceDB`   | `history` (normalized one-row-per-message).                  |
| `<userData>/stagewise/diff-history/data.sqlite`                                 | `DiffHistoryService`   | `pendingFileDiffs`, `editSummary`.                           |
| `<userData>/stagewise/agents/<id>/data-attachments/<blobKey>`                   | attachments blob store | Attachment byte payloads referenced from messages/metadata. |

Per D15, none of the persisted paths or schemas may change during Phase
1; new data goes through additive migrations only.

---

## 3. Intentional deltas

Three structural deltas are locked decisions, not drift. Each is
bridged at the Karton boundary so the compile-time parity assertion in
[](path:w787f/apps/browser/src/shared/karton-contracts/ui/agent-core-parity.ts)
still passes.

### 3.1 `requiredModelCapabilities` (D14)

- Karton: `ModelSettings['capabilities']`, defined in
  [](path:w787f/apps/browser/src/shared/karton-contracts/ui/shared-types.ts).
- agent-core: `RequiredModelCapabilities = Record<string, boolean | undefined>`.
- Why: model-provider-config types (`ModelSettings`, `ProviderConfig`,
  `CustomModel`, …) are host-specific per D14 (SPEC.md lines 353–357)
  and stay in `apps/browser`. The agent only needs opaque capability
  flags for model-selection gating.
- Bridge: structurally identical. The host treats the agent-core record
  as if it were `ModelSettings['capabilities']` when writing; the agent
  never introspects specific flag names.

### 3.2 `toolApprovalMode` narrowing (D22, superseded by Phase 6)

- Karton: `AgentState` narrows `toolApprovalMode: ToolApprovalMode` via
  the host `AgentState` shim in
  [](path:w787f/apps/browser/src/shared/karton-contracts/ui/agent/index.ts).
- agent-core: `AgentState.toolApprovalMode: string` (store-canonical
  since Phase 6).
- Why: Phase 6 made `agents.instances` store-canonical. The generic
  recipe channel used by `BaseAgent.set` writes the whole `AgentState`,
  so `toolApprovalMode` must live on the core shape or the recipe
  would be forced to straddle two stores. The field remains host-
  narrowed (string union vs. bare string) using the same `Omit` +
  re-add pattern `activeModelId` uses.
- Bridge: the Karton-side `AgentState` uses
  `Omit<CoreAgentState<AgentMessage>, 'activeModelId' | 'toolApprovalMode'> & { activeModelId: ModelId; toolApprovalMode: ToolApprovalMode }`.
  The bridge forward-mirror copies the narrowed value verbatim.

### 3.3 `ShellSessionSummary` vs `ShellSessionSnapshot` (D14)

- Karton: `ShellSessionSnapshot` defined in
  [](path:w787f/apps/browser/src/shared/karton-contracts/ui/agent/metadata.ts).
- agent-core: `ShellSessionSummary` defined inline in this package
  (state.ts).
- Why: `ShellSessionSnapshot` is a host-owned environment-snapshot type
  (D14 paragraph on environment-snapshot types staying on the host
  side). The agent-core type is kept identical structurally but local to
  the package to avoid any import edge from `@stagewise/agent-core`
  into `apps/browser`.
- Bridge: the Karton bridge copies the field verbatim; the two types
  are byte-identical at runtime.

### 3.4 `PendingUserQuestion` generic specialization (D14)

- Karton: `PendingUserQuestion` specialized with `QuestionField` and
  `QuestionAnswerValue` from
  [](path:w787f/apps/browser/src/shared/karton-contracts/ui/agent/tools/types.ts).
- agent-core: `PendingUserQuestion<TField, TAnswer>` generic with
  `unknown` defaults.
- Why: the shape of a question field and the answer value are defined
  by the host-owned tool schema. Agent-core models the container and
  lets the host specialize.
- Bridge: the Karton-side `AppState.toolbox[id].pendingUserQuestion`
  refers to the host-specialized type; the bridge copies the value
  verbatim.

---

## 4. Child-agent invariants (D13)

Per D13 (SPEC.md lines 327–332), parent/child agents are first-class
state. The package-owned schema represents them from day one.

### Tree reconstruction

- **Back-pointer only.** `AgentInstanceState.parentAgentInstanceId` is
  the sole stored representation of the tree. There is no explicit child
  list anywhere (no `childInstanceIds` field on the state, no join
  table).
- **On-demand traversal.** Operations that need a parent's children
  filter `state.agents.instances` by `parentAgentInstanceId === parent`:
  - delete-cascade in `agent-manager.ts` line 894;
  - archive-cascade in `agent-manager.ts` line 954;
  - persistence delete-cascade in `persistence/db.ts` line 430
    (deletes children first, then the parent).
- **No toolbox inheritance.** `ToolboxAgentState` is per-instance. A
  child agent gets its own toolbox slice with its own mounts, diffs,
  and pending state. It does not inherit from the parent.

### Invariants

1. **Parent must exist at update time.** If `parentAgentInstanceId` is
   non-null on an instance, there must be an entry at that key in
   `state.agents.instances` at the same tick. Today this is enforced
   *by the host* (`AgentManagerService.createAgent` writes the parent
   row before the child calls `spawnChildAgent`). `AgentStore` in the
   package does not yet enforce this — a follow-up slice migration must
   add a transactional update guard when the `agents` slice moves into
   `AgentStore`-canonical.
2. **Resume is root-only.** `resumeAgent` (line 784) throws if the
   target has a non-null `parentAgentInstanceId`. Child agents are only
   created transiently via `spawnChildAgent` from a live parent and
   never survive a process restart on their own. They are stored on
   disk because delete-cascade needs the pointer, but they are not
   independently resumable.
3. **Delete cascades depth-first.** `deleteAgent` recurses into
   children before deleting the parent from both the in-memory state
   and the persistence layer, and before removing the per-agent blob
   directory. `archiveAgent` performs the same depth-first traversal
   for the in-memory side without deleting persisted rows.
4. **Child agents are `persistent: false`.** The only child-spawning
   agent today is `WorkspaceMdAgent`, which sets `persistent: false` in
   its config (see
   [](path:w787f/apps/browser/src/backend/agents/workspace-md/workspace-md.ts)
   line 23). The agent row is still written so delete-cascade works,
   but the flag means no auto-resume happens on app boot.
5. **Toolbox is created per-instance at `createAgent` time.** The
   toolbox slice for a child is populated by the same services as for
   a root agent (mount-manager, diff-history, etc.). No toolbox state
   is copied from the parent.

### Open items for follow-up slice migrations

These are explicitly **not** fixed in this S4 spike — they are
documented here so future migrations do not silently regress them.

- **Parent-existence guard** — when the `agents` slice moves into
  `AgentStore`, the update path for `parentAgentInstanceId` must
  reject non-null values that point to a missing parent. Currently
  untyped and untested.
- **Orphan handling** — what happens if the parent row is corrupted
  or manually deleted while children exist: the persistence layer
  cascades correctly on explicit delete, but an inconsistent DB would
  leave orphaned child rows readable. No defensive cleanup exists.
- **Revert-to-user-message across tree.** Not a current operation;
  flagged because future revert semantics need to decide whether a
  parent revert touches child sub-trees.
