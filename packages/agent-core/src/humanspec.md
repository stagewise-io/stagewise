## Isolating the agent into an agent-core package

Currently, the coding agent of the stagewise desktop app is entangled with other electron-related code:
They share the same communication channel (Karton), live in the same package (apps/browser) - and the agent uses electron utilities such as storage paths.
At the same time, the core agent directly uses desktop-provided tools (browser access, sandbox access, shell usage) without any abstraction and thus is tightly coupled to its environment.


We are proposing a split architecture in which the agent loop is implemented in its own package `agent-core` and used by hosts.


## Assumptions

We assume that both the package `agent-core` and its host run on the same machine and run inside an node.js environment. This allows us to use node:fs functionality in `agent-core` and just receive and consume paths from its hosts - but we'll proxy 'node:fs' through one module 'src/fs' which will make it easier to abstract and refactor it later.


## Communication & State

The agent in `agent-core` will be the authoritative source of agent state - and will be responsible for persistency. Reverting to messages, undoing tool-calls, etc. are all part of managing this agent state and are `agent-core`-responsibility.
We will build `agent-core` to use an agent-store and a karton-bridge - so that for the Desktop app, access to and modification of state won't change. We will later plan to also support JSON-RPC over stdio to let other hosts communicate with agent-core.


## Model/ LLM construction

Since the host is responsible to initiate an authentication flow, it will also hold the logic for model-construction - it will expose a `getModel(id)` which can be used by `agent-core` to access and use an LLM provider's endpoint for inference.


## Mounted workspaces/ paths

Workspace-paths are mounted with a mountPrefix - and managed by `agent-core` (e.g. resolution and mapping, etc.) - however, the `host` is responsible for interactively letting the user mount workspaces (using file-picker, etc.) and registering those on the `agent-core` instance.

Persisted data (AgentStore, SQLite rows, on-disk blobs, message metadata) only ever contains mount-prefixed virtual paths - never absolute paths. Resolution to absolute paths happens at the last possible moment inside the `src/fs` module. This keeps the future wire-abstraction of `node:fs` tractable.

The host may also expose paths to binaries that `agent-core` spawns directly (e.g. a ripgrep base dir for the file-search provider). Those are part of the same host-paths surface - the host owns *where* the binary lives, `agent-core` owns *how* it is invoked.


## Tool declaration and usage

`agent-core` will ship with a base set of tools which will be expected to work regardless of the host - which are essentially file operations (read, write, multi-edit, ..). The host will be able to provide mounted paths that the agent will then be enabled to have access to and read from and write to.

Other app-dependent tools will be provided by the host, using ai-sdk tool definitions and providing execute functions - those tools include:
- js sandbox functionality
- browser functionality
- lsp
- shell functionality, tools, and management

`agent-core` doesn't need to know those tools - but the host will, and the host will also have proper typing/ type casts in place to fully preserve parameter/ tool information to keep the ability to properly render tool-ui parts, agent messages, etc. - `AgentMessage` and friends are generic over `TTools extends ToolSet`.

Tool approval information is embodied by a host setting ('alwaysAsk', 'alwaysAllow', 'smart') and is a responsibility of the host - for each tool definition, the host sets the AI SDK's native `needsApproval` field — a boolean, or a classifier function in 'smart' mode — which `streamText` invokes during the tool loop. `agent-core` never inspects or calls it.


## Mention- and Slash-providers 

Since resources for tiptap-providers live in both places, `agent-core` and `host`, each one will simply provide getters and query-functionality for the raw sources - a(ny) consumer will then be able to query, score and render those resources in a tiptap provider.


## Skill discovery

The host will be able to provide skill-base paths, which the `agent-core` package will use to discover skills using `node:fs`.


## Diff-history

The agent will own creating and managing diff snapshots via sqlite tables like it currently also does - it will use its own functionality for file-modifying tools to store file snapshots that allow recreation, undo and redo. The host will provide the db base path.

External file changes (sandbox side-effects, shell writes, user edits to open files) are captured by a `node:fs.watch`-backed watcher that feeds into the same diff store. This is why the `src/fs` module is the single intercept point: both in-tool writes and out-of-band changes flow through the same seam.

## Attachments

Same as diff-history - `agent-core` will own the storage and data management, `host` will provide the blob path.


## Environment-snapshots

`agent-core` will implement a snapshot-provider - which the `host` can use to register their own providers (e.g. shell-changes, browser-changes, log-ingest etc.) while `agent-core` can register its own providers for agent-owned logic (e.g. `plans`, `agents-md`, `enabled-skills`, etc.).


## Agent modes

There is **no support** for agent modes - an agent only has one mode. Planning, preview, debugging, etc. will all be handled via slash-commands (just like today) - and any environmental requirement such as a debug-server for /debug will be provided by the host.
