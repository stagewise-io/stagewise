# Changelog

## 1.0.0-alpha.37 (2026-03-18)

### Bug Fixes

* treat file-deletion with creation as modification (2512090)

## 1.0.0-alpha.36 (2026-03-17)

### Bug Fixes

* add app-launched to bypass-list (ce0fdea)

## 1.0.0-alpha.35 (2026-03-17)

### Bug Fixes

* fix license-dialog in about-page (c096a73)
* prevent jumping around of cursor on input fields (06fc409)
* graceful handling of token limit hits during tool calls (d162b0c)

## 1.0.0-alpha.34 (2026-03-17)

### Features

* add custom ui for plugin-/ skill-reads (ae42973)

### Bug Fixes

* fix 'stuck' resizable panel for chat-history on max-w (2d09a29)
* prevent user-question checkboxes from shrinking (039732f)
* remove duplicate 'compacted' message (74bda1d)

## 1.0.0-alpha.33 (2026-03-17)

### Other Changes

* remove "tool" suffixes from tool names (4ebd0a3)

## 1.0.0-alpha.32 (2026-03-16)

### Bug Fixes

* don't show env-message when agent reverts its own edits (21d7c09)
* name 'handle' to 'id' for tabs in message-structure (752dfc9)

## 1.0.0-alpha.31 (2026-03-15)

### Bug Fixes

* make context-usage ring use dynamic context size (be816ce)

## 1.0.0-alpha.30 (2026-03-15)

### Bug Fixes

* add missing asar-unpacking for 'sharp' (96e3b52)

## 1.0.0-alpha.29 (2026-03-15)

### Bug Fixes

* add 'sharp' to dependencies (f7de61b)
* fix '<div> cannot be a descendant of <p>' for file context menu (50494c3)
* align downloads-ui with history-ui (f3d0e71)

### Other Changes

* replace tabHandle with shorter, unique tabIds (d1ef5b1)

## 1.0.0-alpha.28 (2026-03-15)

### Bug Fixes

* move telemetry-filter to application-level (4fa167e)
* prevent link-clicking default behaviour in chat-input (7896a57)

## 1.0.0-alpha.27 (2026-03-13)

### Bug Fixes

* revert to base64 for file parts (fa852f0)

## 1.0.0-alpha.26 (2026-03-13)

### Bug Fixes

* increase tab-handle recycle limit to 100 (8e4d4b1)

## 1.0.0-alpha.25 (2026-03-13)

### Bug Fixes

* add explanation-string to sandbox-tool (1ecd95d)
* use theme tokens for logo colors (2210c27)
* fix logo-colors in sign-in and onboarding (037706f)

## 1.0.0-alpha.24 (2026-03-13)

### Bug Fixes

* fix windows-focus bugs on omnibox (055ebd2)
* add strict type checking and noUncheckedIndexedAccess (5d6624e)

### Other Changes

* enforce explicit aliases for pages- and ui-imports (2378337)

## 1.0.0-alpha.23 (2026-03-12)

### Bug Fixes

* fix unchecked array-access in diff-history (73fb2dc)

## 1.0.0-alpha.22 (2026-03-12)

### Bug Fixes

* make library-tools return proper error messages (3ee1a47)
* add more padding to shell-cmd-text (1c9aac5)

## 1.0.0-alpha.21 (2026-03-12)

### Bug Fixes

* fix stale z-index/ focus handling on omnibox (0d997ab)

## 1.0.0-alpha.20 (2026-03-12)

### Bug Fixes

* fix error on app-start due to unstable arrays (29eb8f0)

## 1.0.0-alpha.19 (2026-03-12)

### Bug Fixes

* fix olive surface-tinted color (294f525)
* use release_pat to trigger ci on release-pr's (b0703a9)

## 1.0.0-alpha.18 (2026-03-12)

### Bug Fixes

* restore release-script (635ab3b)
* capture opt-outs from telemetry so we know what we don't know (a2d6e2b)
* fix queue error when approval-message is present (1f9e434)
* add deprecation-cli for 'npx stagewise@latest' (2458bc0)
* fix rerenders with unstable karton arrays (7482bd1)
* make signin-link dynamic (5da4a04)

## 1.0.0-alpha.17 (2026-03-11)

### Bug Fixes

* catch lsp-client errors on startup (0769679)

## 1.0.0-alpha.16 (2026-03-11)

### Bug Fixes

* bump api-client and fix library-tool signature (8adc977)

## 1.0.0-alpha.15 (2026-03-11)

### Bug Fixes

* add bg to 'open in file' button for workspace-md (394079d)
* fix toolpart-ui for no-content (71d6e70)
* change default-settings url to agent models (fe7a716)
* move telemetry settings to 'user' (eff1858)
* make scrollbars in settings-about subtle (1dc1930)
* show workspace info in file-diff-section (42c5ddf)
* only open new diff-review tabs when none is already present (e90cc02)

## 1.0.0-alpha.14 (2026-03-11)

### Bug Fixes

* fix path resolution for shell on MacOS (6a41572)
* only show file-diff env-msgs from other contributors (not the agent itself) (3c0d1d7)
* make sure that broken tool input doesn't cause ai sdk failures (ed09a35)

## 1.0.0-alpha.13 (2026-03-11)

### Bug Fixes

* fix windows build signing (8a58f5a)

## 1.0.0-alpha.12 (2026-03-11)

### Features

* use cached asset urls for images to prevent errors with size-constraints in our api (bdfbc2f)

## 1.0.0-alpha.11 (2026-03-11)

### Bug Fixes

* fix ui-import for pages app (84f2474)

## 1.0.0-alpha.10 (2026-03-10)

### Features

* add workspace-provider for @mentions and agent-mentions (ba047f1)
* add tab-message-format to agent msg formats (abe0f5d)
* add basic telemetry to tool-execution (fd95f5f)

### Bug Fixes

* improve execute-shell-command tool part ui (e81270f)
* use env snapshot for mounted-path providers in UI (8efd274)
* fix unmounting workspaces of separate agents (6a50a56)
* fix dynamic imports in sandbox runtime (0a15624)
* explain mini-app-iteration with file-tools in system prompt (39f259c)
* include system prompt section about mini-app vs cdp vs source code (7d37dde)
* soften system prompt about mermaid and trade-offs (aecdce3)

## 1.0.0-alpha.9 (2026-03-10)

### Bug Fixes

* add missing auto-mount of workspaces to ActiveAgentsGrid creation (7ab1990)
* place env-messages **before** tool-approval parts to ensure ai-sdk conversions work (6cc5bfb)
* disable 'approve'/'skip' buttons in bash execution on input-stream (2353638)
* replace deprecated sonnet-4-5 with 4-6 (faf596f)

## 1.0.0-alpha.8 (2026-03-09)

### Features

* add posthog events and rename telemetry boxes (4184b22)
* refactor prompt structure to allow for aggressive caching (12e7ce9)
* support CTRL_N and CTRL_P in user questions nav (189a768)
* add support for sticky routing and usage limits info in messages (24c90be)
* show git branch in workspace-popup when git is detected (9d96318)
* show pricing info per model (8de9e78)

### Bug Fixes

* make waitlist use env var (4ca1d4b)
* prevent issues when retriggering tab with hotkey (ccdca39)
* parse frontmatter for skills reliably with gray-matter (31f215a)
* fix tool-call truncation for string tools (5fb82c4)
* update landing-page demo screenshot and content (51645f7)
* show workspace.md in file system instead of settings (a79ef76)
* fix connection issues for pages api (a742cea)
* fix omnibox z-order issue with webcontents (a664b1f)
* update suggestions and prompts to use unified, shorter use-cases (a85a4a6)
* fix incorrect import-hook in settings (dbff745)
* use subtle scrollbar on internal iframe (b78ac3f)
* remove unfinished changes from website (f065906)
* fix broken markdown regex to strip markdown content properly (979c460)
* fix broken metions-label in queue section (48f8e19)
* fix tinted bg on badges in queue section (0814dff)
* make resource-changes in mini-app update the app-ui (fc8d041)
* decrease text-size of questions in user-question tool response (ea7c15c)
* use cache for mermaid to prevent layout shifts in chat-history (646860f)
* include env-messages when sandbox restarts (518d045)
* improve compression-context and prompt and increase threshold (8d7dd79)
* update instructions in figma skill (3d43973)
* remove overscroll-contain from mermaid diagrams (8cf436a)
* remove 'error' from agent card when plan limit exceeded, add 'configure api key' cta (962bbdb)
* change gpt 5.3 reasoning effort to 'medium' (d315559)
* fixing figma token explanation (46d2078)
* auto-focus input after early-agent-stop; stop agent on esc (7048c57)
* auto-mount workspaces of last agent on startup (fa2f668)
* fix chat-focus after early agen-stopping (96ed709)
* fix tool-call-approving flow for immediate user messages w/o approval (d781c34)
* align account-button icon in navbar (7731d56)
* track diffs for mini-apps (enables undo and diff preview) (de102e5)
* show beautified message for plan-limit-reached errors (4df28e2)

### Other Changes

* remove unused props (c0ca135)
* remove unused type and schema defs (9598899)

## 1.0.0-alpha.7 (2026-03-07)

### Features

* add proper math formula rendering (c94214d)
* add figma-plugin (1a57ca0)
* add support for bundled plugins w/ apps (147315c)
* support internal apps per agent instance (b14d43a)
* let agent access credentials via sandbox (a08bbc0)
* add google-ai api key to credentials-list (540e6a7)
* support 'API.onCDP' in sandbox (cbb32b7)
* add credential-service with pseudonomized credentials (fdf824c)
* allow disabling of models and restructure settings (f3259b4)
* add custom-apps-parser for internal apps assets (a5f4808)
* support extension-patterns for file-preview registry (6c402d2)
* add file-previews to mention previews (a3b0563)
* add tab- and files-providers and wire mentions-UI (248ea41)
* add protocol handler for file-contents (sw-file://) (e8187b6)
* add 'Open file'-context-menu to file-paths (4fced7a)
* add execute-shell-cmd tool to agent (50de7c1)
* add shell-service for platform-specific shell cmd execution (a844241)

### Bug Fixes

* tab loading state not properly shown (b1f2638)
* remove formatting on text pasting into chat input (67fcfcc)
* remove early return for no mounts in skill discovery (bb8cb38)
* explain app-width-constraints and mount-composition in system prompt (e34feaa)
* remove redundant heading from general agent settings (ec51361)
* catch uncaught errors for non-existing lsps on mounts (3cd23cb)
* add 'allowedOrigins' to credentials data type (ef4a2ac)
* introduce 'link' variant of buttons (4a56b6b)
* send attachment data in correct format (8ab5ff1)
* fix omnibox-focus after webcontents-focus (e1909e5)
* prevent faulty tool input state on aborts (877573d)
* add 'always available' mounts to system prompt (302f200)
* fix auto-tool expansion (7c8c912)
* fixing truncation in workspace-md section in chat (0883aa9)
* replace hardcoded color tokens with stage-ui theme and updated vscode pages (d00bf89)
* fix 'open in' URL resolution on file tool parts (633bb4e)
* fix 'Listing files...'-label in workspace-md agent preview (9d24dc5)
* make file paths consistent (01d8dd1)
* move stagewise ui to foreground when notifications are active (acb1325)
* fix 'thinking' duration loss with multiple thinking parts (5e15e8f)
* remove unnecessary file-size limit in 'sw-file' handler (6fc58b8)
* decode URIs in attachment-links (8647a7e)
* immediately open file-picker in workspace-select without recents (f8f61cb)
* fix filename-extraction on windows (4a5503c)
* change wand-position for workspace-md generation (1edb0e1)
* include $HOME in shell env vars on linux (cfdfb5a)
* fix that onboarding-screen shows during app-load (40cc0a4)
* spawn shell process with '-c' to preserve PATH (6fc972a)
* fix streaming-interval for sandbox-output (dc398d2)
* improve exploring-labels to include more details (7e31370)
* fix single reasoning-part grouping into 'exploring' (ed425dd)

### Other Changes

* standardizing electron resolver schemes (63b84b6)
* standardize path access through path.ts, move and rename data files (a9a433c)
* update to new stagewise api (95d3463)
* make file-preview-registry reusable (86d0599)
* only save env-snapshots domains when they actually changed (81d3b5a)
* move truncation-detection to 'use-is-truncated' (1a23aca)

## 1.0.0-alpha.6 (2026-02-27)

### Features

* allow suspending/archiving agents (f2589eb)
* prepare components for mentions-feature (7e17f98)
* stream sandbox-outputs and reset timeout on API.output (4ee7706)
* add origin-grouped history entries (6a7e26d)

### Bug Fixes

* weird behavior when chatting normally with the agent (fe45694)
* add 'Open file' to diff review page (1c0f132)
* make file-icon use theme colors (0ece0b7)
* remove weird keyboard tabbing control for web content tabs (d84f3a1)
* enable message send button on chat switch if input contains text (175b3f4)
* align UI of 'connect workspace'-button with workspace-badges (2090fca)
* add timeout safeguards to lsp and relax instructions in system prompt (da082a4)
* fix import for pages-app (4eedeec)
* show git icon on workspace badge (526fc9e)

### Other Changes

* more explicit steering of stagewise-conform behavior in OpenAI models (68a0b1e)
* restructure rich-text attachment files (cefd75b)

## 1.0.0-alpha.5 (2026-02-26)

### Features

* add user questioning tool (da08b19)
* add env-messges for sandbox-restarts (e1ba1c8)
* watch skills- and md-paths to sync with settings-info (94735d2)
* include basic skills-overview in agent-settings (f98e420)
* add workspace-information to workspace-badges (1fed92c)
* support disabling skills per workspace (1979c2e)
* persist and re-initialize mounted workspaces per agent (66d600b)

### Bug Fixes

* reset sandbox timer on API.output* (ad3a64c)
* fix posthog-client disabling and add logs for posthog-errors (3a01176)
* improve 'isWorking' indication in chat-history (15c7542)
* align agents.md settings-section with workspace-select (29ba256)
* increase error-logging verbosity for base-agent (760cc41)
* don't dedupe workspace-skills by name (but show all) (d0ebbdc)
* include detailed attachment-error messages for the agent (6f0e2c8)
* use nucleo icon for branch icon (7aa8095)
* include additional error-metadata for posthog errors (a511b6e)
* make attachment-badges 'secondary' on inputs (8858526)
* fix attachment-drop error on edited user-messages (05e72df)
* enable create agent button only when applicable (3f7466f)
* alphabetically sort skills in workspace-info card (7606663)
* prevent creating new agent when another empty agent already exists (0ea34a9)
* fix model-select compat with new combobox (6de86be)
* fix auto-scroll to workspace-md on 'Show file'-click (0d046ef)
* remove unused biome-ignore (e040ff6)
* include agents/workspace-md content in karton state (948c4ac)
* fix attachment-drop for huge on-device attachments (b17ade6)
* align padding on active-agent toggle (82d8956)
* set correct initial pre-release channel and make it adjustable in settings (05d7abb)
* allow individual release channel instances to run in parallel (81e5c66)

### Other Changes

* clean up agent notifications mechanism (d232768)

## 1.0.0-alpha.4 (2026-02-24)

### Features

* add button to show/hide sidebar (125f26d)
* add a (hideable) active agents section to the sidebar (257d2c2)
* support attachment-render-registry per mimetype (f4e902c)
* add permission-sets to mounted workspaces (a17f680)
* store attachments as files and mount into agent workspaces (5b21a2f)
* add isolated fs access to sandbox (replaces API.writeFile) (794423b)
* support multiple mounted paths per agent (28c610b)

### Bug Fixes

* reduce flicker on window tab change (6f6db5b)
* make ide-default-logo inherit its bg color (9f5338c)
* fix token-refresh for api clients in toolbox (3856b72)
* add 'include_gitignored' param to grep and glob (ccb1164)
* prevent invalid agent state and show nice errors for internal issues (ba31708)
* let user control workspace-md generation (7f030a2)
* add working recovery from render process crashes (7477bfe)
* move away from deprecated model for validation (6cfd349)
* accept all pending edits on agent-deletion (1cd20d9)
* fix env-message error with 'reverted' changes (64f8cae)
* auto-focus input on workspace change (198615b)

### Other Changes

* use optimistic updates for agent creation/switch/deletion (597354b)
* move backend-wiring and state sync between pages- and main-app (a0f3449)

## 1.0.0-alpha.3 (2026-02-22)

### Features

* scope workspaces to agent-instances (e9e2a79)
* add chat undos with or without file change undo (8cbbd43)
* new home page with most recently visited pages and local pages (edddf67)
* add enviroment-updates as user msgs (0e44011)
* add more accurate "most visited pages" algo (86e9992)
* show locally running apps in omnibox (fc29ad6)
* show locally running pages on the home page (7464db5)
* include contributor-set in blamed-hunks (bc4af99)
* add slide-indicator to demo-slide in onboarding (ea39840)
* support error-state in workspace-md-section (81fb5ec)
* add mvp account page (a642a22)
* show sign in prompt when user is not authorized and makes request to stagewise api (8b42cf2)
* add immediate key validation for byok settings (22b3a8b)
* add custom providers and byok support (97b5712)
* use the last active agents selected model for a new agent instance (b2e6daa)
* extend sandbox API to support multimodal llm-reading (ff2b414)
* add opus-4-6, 5.2-codex and sonnet-4-6 (0633882)
* add basic onboarding (api-keys disabled until supported) (4d234cd)
* add scripted typing hook (a09c43a)
* add api-key validation util (8dd5cc6)
* allow configuration to include/ignore agents.md (b36325e)
* support dynamic imports of esm.sh and node.js dependencies (c54b887)
* add link aliases (7a0fc50)
* re-use last selected model in new chats (8f5dcd6)

### Bug Fixes

* make combobox a modal by default to fix web content layer issues (48ddd01)
* fix flickers on edit of previous user message (52275b2)
* instruct agent to omit 'Domain.enable' for domains that don't have one (09f1b82)
* increase max-h for exploring part to allow image previews (7946567)
* only show revert-dialog when file changes happened (5f89afc)
* allow rendering image-attachments as cards (04b5761)
* improve result-rendering of sandbox-js (5a146ec)
* provide output-attachments of sandbox for file-references (ffd59e8)
* fix infinite rerender in agent-settings (1c07a4b)
* open new agents with default workspacepath (e6e6f1d)
* use lsp.closeFile for file closing (008ccbe)
* add text-shimmer to toolpart chevrons when title shimmers (0370622)
* fix file-locking for agent-changes (58276a4)
* remove unused 'explanation's from tool parameters (10506a7)
* prevent occasionally empty omnibox suggestions (6f88a72)
* fix immediately reads by chokidar in diff-history service (35add7b)
* fix use-optimistic reconciliation in chat-history (ebfec18)
* sync karton-diffs on each file-edit (00f13a6)
* wire diff-history with agent-instances and automatically hydrate state (1a71f36)
* add line-removal contributions to FileDiffs (03a6ab3)
* fix partial-accepts after preceding accepts for file edits (852b257)
* hide noop changes for external files in diff summary (c032055)
* add ide-picker on first file-opening (a421f54)
* open paths in finder/ explorer when no ide configured (ecc8ad3)
* make agent-access-paths persistent for file-opening (d1db1ab)
* fix border color tokens in account page (b303506)
* add settings-item to app menu (96aa9db)
* stop workspace-md-agent on workspace-disconnect and show error state (1b8dedd)
* use switch for agents.md-toggle (5771198)
* wire api-keys in onboarding with preferences (9858162)
* prevent accidental ommission of markdown formatted content when re-editing (c4630a7)
* show auth prompt only when user configured to use stagewise api for models (202400a)
* fix workspace.md file name in agent settings (8fd25ec)
* fix nested button warning (7c87bcc)
* fix animation flicker in onboarding-text (2523361)
* fix text-clip-attachment preservation in user messages (d178068)
* instruct the agent to use esm.sh?target=node, and never block eventloop in sandbox (e119da9)
* add 'scroll'-buttons to home.tsx for horizontal scroll (c87364b)
* make info-text-color in toaster use standard 'foreground' (c0ef763)
* only update omnibox etc. on main frame navigations (08db6ae)
* reduce identity verbosity of agent when not being asked (99d02ee)
* fix navigation on error pages (c61b6a1)
* avoid overly explicit version definitions when importing deps in sandbox (253fd1a)
* reduce tokens for application-info system prompt (7ae94fd)
* add js-sandbox section to system prompt (c62c0fc)
* fix scrollbar-cutoffs in internal pages (3471b1c)
* fix scrolling-issue for project-md-section (3fbfb61)
* fix using optimistic user msg values when msgs are queued (f07bdc5)
* add max-h- to status-card-sections (8d34288)
* add error-boundaries and error-tracing to renderer process (1df42ff)
* add thorough error-tracing and sourcemap-publish during packaging (12aec29)
* memoize chat-list, remove virtualization and add auto-loadMore (e9d2a15)
* keep height-cache-entries after chat-switch (b81ded3)
* hydrate shiki-cache on initial load to improve performance (89f34d9)
* fix read-modify-write races for 'markChatAsViewed' (311defa)
* fix build with env vars on windows (e9214dd)
* fix type name of stagewise ui tools (4e77c75)
* keep favicon and title state consistent with actually shown page (406fb0e)
* fix layout-shifts in chat-list by making streamdown static (50aeedf)
* correct import path (b3fcf83)
* more memory for build to prevent builttime crashes (a9f1822)

### Other Changes

* fix unnecessary re-renderings in agent panel footer (a8c5e03)
* fix rendering performance of chat footer (02d4d86)
* cleanup and improve render performance of sidebar top section (97426a8)
* use base-ui combobox for agents instance dropdown (eb9497a)
* move lsp service into toolbox folder (53a9d28)
* create 'FileDiffSnapshot' type to prepare env messages (cc1d0e7)
* make image-preview components reusable (0357add)
* minimize lag on tab/window resizing (90cf473)
* migrate auth to use supabase token directly (275305c)
* move chat-suggestions to own location (64ae857)
* rename project.md to workspace.md and refine system prompt for generation (e4d8274)
* reduce application info context and improve sandbox script writing instructions (7627482)
* refactor agent system prompt to be based on markdown snippets (b35570a)
* cleaned up telemetry-event-types to refactor events (a51b9cc)

## 1.0.0-alpha.2 (2026-02-13)

### Bug Fixes

* correct import path (b3fcf83)
* more memory for build to prevent builttime crashes (a9f1822)

## 1.0.0-alpha.1 (2026-02-12)

### Features

* add new agent error UI (3a9a48b)
* add binary-file preview for diff-reviews (ab58d6b)
* add fileWrite and attachmentRetrieval to sandbox API (d769cf5)
* add more detailed tool-labels to cdp execution (790d48a)
* add 'updateStagewiseMd' as tool to chat-agent (b05f397)
* add support for asynchronous child agents as tools (4410bd5)
* wire-up stagewise-md-agent on workspace-connect and add section in status-card (dd6efa6)
* add stagewise-md-agent for stagewise-md-initialization (ae21537)
* add 'write-stagewise-md' tool to toolbox (4322210)
* replace 'console'-tool with general sandbox-tool (8395015)
* revert streaming message if it's only a short one and user stops (63903ed)
* persist agent chat state when creating agent (dac5585)
* wire available tools into chat-agent (527b9e1)
* persistence and title generation for agents (00a4769)
* add agent-context section to agent settings (f68da7a)
* initialize toolbox and new diff-history service (e31a4cd)
* add toolbox-service with new tool definitions (af9ea80)
* implement new diff-history-service (4d374d4)
* add robust spec and db-utils for persistent diff-history (352ece8)
* support attachment-badges in assistant messages and prevent unsupported files (7a51d05)
* add sqlite persistency to agent-chats (00a6e96)
* add interactive color swatches to inline assistant code (6337b8b)
* add hook to detect scrollbar with for native scrollbars (8d6e363)
* add caching for shiki highlighting-computations (336ef96)
* add CTRL_N and CTRL_P navigation to omnibox (db8c865)
* highlight full URL when focussing url input omnibox (2bc9482)
* allow toggling dev toolbar with hotkeys (7df25c9)
* improved detection of dominant colors (a434398)
* add "dominant colors" util (14e81fb)
* add color histogram (0595cb7)
* add color picker to dev tools (1c6a680)
* add color picker util and refactor web contents overlay (430fc03)
* add customizable dev tool bar (c10eb14)
* add tiptap richtext editor for displaying attachments in chat-input (a397543)
* show suggestions on empty state (3494a51)
* show recent search and opened pages in omnibox (d1399f4)
* support file-links as attachments (2bc0ead)
* add omnibox to tab url input (4b623a3)
* make early-agent-cancellations repopulate chat input (1ba660e)
* add ide-setting to agent settings (726f936)
* add AGENTS.md support (10a678f)
* add tool-part ui for stagewise-md update (5b1da99)
* add queueing-capability to agent chat (d0d0057)
* support basic auth (2c370d5)
* add fullscreen support (b0e8500)
* persistent permission settings (fcc2b93)
* add permission granting/rejection (0728cd6)
* add proper 'waiting'-message to agent (1aa6266)
* introduce and use derivable border- and hover-colors (d91ebb7)
* add unsafe "continue" for pages with bad ssl certs (126ed0e)
* add pretty error pages (186125f)
* add media and spellcheck handling to context menu (0fa42f0)
* change default page for startup and new tabs (942025c)
* add custom default search engine setting (f14997e)
* add auto-updating (c7cb714)
* add about page (9e72c95)

### Bug Fixes

* repair context compression logic (db057c1)
* fix error ui rendering (eea0962)
* fix 'endedAt'-overwriting of part metadata (c35960e)
* make image-previews have dynamic widths with max-w (7596e73)
* fix sorting of chats in chats-list and add working-indicator (f9f2f65)
* fix internal-app warning about unrouted components (3d082b6)
* only show chat previews of chat-agent in chats-list (57766e3)
* fix prose-mirror issues in tiptap-editor next to attachment nodes (6cfbf25)
* fix attachment icons and data-lookup (b8ca0e3)
* fix user-message flickers on send and use optimistic messages (9500ede)
* fix chat-flickers on msg-send (257f69e)
* remove auto-element-selection on inspirationpage-open (be41f06)
* fix wrong logo in signed-out content (af8bc36)
* fix group label positioning in select component (95d4c17)
* fix status-labels in project-md-agent UI (1b9956c)
* fix signup-typo and use orb-logo (b2849c0)
* unify 'FileDiff'-type usage in frontend (f724234)
* fix agent stops (initial and after tool-results) (1f7a677)
* make stagewise-ui interactive when omnibox is open (but don't focus webcontents) (52882e1)
* auto-focus chat input when new chat is created (13c5cbe)
* small typing fix (052d2ca)
* properly run steps with our own wrapper logic (639cc4f)
* fix buggy chat input behavior (6675c76)
* prevent flicker of tab loading state in UI (84178c1)
* fix image-attachments and attachment-padding (3826234)
* auto-enable CSS cdp domain and add 'enabling'-guidelines to system prompt (25b6dfa)
* add explicit streamdown components for paragraphs, quotes and images (1039ce9)
* add explicit list elements to streamdown (b95c044)
* add select-none on code-block line numbers (fc49f90)
* add interaction state and cdp info to selected-elements (e2db8c9)
* make workspace-connect CTA have a hover color (d5151f2)
* make suggestions in history aware of status-card height (c519746)
* fix state-syncing of experience-data for pages-karton (ab921cd)
* add id to context-file section in agent settings (692f6fd)
* fix icon colors in attachment-badges (d4a526e)
* add AgentConfig type to config declaration (fb4c828)
* add max-w to searchable-select (e3ff716)
* removed scrollbars on tooltip-hover in internal pages (7d35cf2)
* fix broken background color in diff-review internal page (f07bcab)
* fix warning-icon color in error pages (833cfee)
* fix wrong import paths for utility-hooks in internal page (fe1dc1e)
* fix logical bug for single file hunk-accepts/rejects (3a15c22)
* align toaster component with ui system (a18a18a)
* enforce strict-mode in ts-compiler and fix typing issues (7c7b27a)
* increase max-h cap on toolpart-ui (9432dde)
* fix diff-accepts for external files (926462e)
* make sure that history doesn't fail with thinking as last msg part (f86e30e)
* catch crashing ui renderer and recover automatically (465c468)
* pass 'isWorking' as prop for improved memoization (650006c)
* add 'ghost'-style to toggle buttons (15bd06e)
* add custom <hr/> component for streamdown (5086fb5)
* use superjson based json columns for proper serialization (f75b2f2)
* reduce bot detection rate (56a556f)
* keep attachments in proper state on undo (21c8bff)
* fix recursive archiving/ deletion of agents and subagents (22b6d70)
* fix native hotkey forwarding on chat-input (705781d)
* fix auth loop in experience-service (ca13178)
* fix inconsistent 'not null' field for agentInstance table (1aec09a)
* fix fetching finish tool (2b23108)
* add diff previews to file modification tool parts (baf5a63)
* fix badge-shrinking of attachment links in queued messages (453f7cf)
* fix agent state and chat agent tool config (bcc1d9d)
* add attachment badges to queued messages (cd73b9b)
* use roboto-mono for mono fonts (code-blocks, etc.) (b6c94a9)
* fix broken message-spacing in chat-history (559165b)
* fix all kinds of type issues and make agents configurable (581672e)
* add 'null' for getTool in toolbox to indicate missing dependencies (b9f5ad9)
* fix suggestion-flickering in chat-input (b1d4f70)
* let agent resume after tool-call-results (807623b)
* fix scroll-blocking codeblocks in streamdown (5fe95b6)
* fix diff-history service issues and add e2e tests (f7f4e00)
* fix toolbox getTool returntypes (b3650b4)
* fix omnibox-parsing of localhost-URLs (bd63556)
* fix Meta+F search-bar trigger issue (83962fd)
* make queue work properly again (cf8a23e)
* align dominant hotkeys with 'reserved'-list from chrome (5c800da)
* add native-event-handling guard to webcontents-event-lifecycle (2ed1764)
* emphasize the use of color links for color embeddings (a07b45b)
* fix race condition in pages-karton initialization (50289f5)
* fix tabs component to match new design (5ff992f)
* fix 'getAllEdits' function in diff service to return actual chat-id-summary (8acde3e)
* fix CMD+L-focus on omnibox after chat-input-focus (2d0d2d8)
* fix broken import links for internal settings page (c70d435)
* fix chat grouping by date to respect user's timezone (5a531e8)
* rm top-border-radius from chat panel child (6d7e20b)
* replace copy-button with tooltip on inline colorswatch (f3765e3)
* virtualize nodes in chat history to improve performance in chats with many messages (18ac996)
* add max-height and attachment-margins to view-only chatinput (78a9b77)
* fix dependency-loop in 'is-container-scrollable'-hook (7fa756f)
* fix performance- and ui issue in file-write tool call UIs (13772d8)
* fix import path aliases for pages app (6b984a5)
* fix chevron-usage in collapsible (76b75c5)
* fix unknown-tool-call error interruptions (agent can now proceed) (af6c880)
* add text-clip-attachment content to user message in prompt (66b055d)
* add view-only mode to user messages for better performance (4ab64d8)
* prevent open popovers on tab switching (cc3fa07)
* make writing to clipboard work again (1141d9a)
* prevent visual bug in collapsed sidebar state (17fe7fd)
* prevent visual cutoff of top-most panel in dev toolbar (0afd2eb)
* allow escaping out of color picking of contet element selection (a73840a)
* make sure that the background and cutout are always in sync (2e2ad2d)
* force omnibox to close on tab change (003c6f5)
* fix color of sign in prompt (9cee26b)
* make element-selection focus again in webcontents (e99e585)
* don't change main frame to error page on subframe cert fail (52cf56f)
* web contents properly receive focus on tab change and window focus (a9716d3)
* highlight correct item in omnibox and keep suggestions on closing (fb94ffe)
* show correct url on error page (5e2de96)
* move misplaced padding in chat-history (a099fcb)
* remove not-existing 'search'-param from route-invocation (b43e2df)
* add contentClassname to overlay scrollbar to allow styling (74f95db)
* implicitly accept pending edits on workspace-change/ disconnect (5d4e34d)
* fix programmatic-scroll-behaviour for reasoning-parts and chat history (3178e32)
* fix faulty selector for inactive-tab border radius (a31abdd)
* fix diff-history sync-issue after baseline-accept and manual file-deletion (8051d42)
* fix broken sync between pages diff review and diff card in chat footer (97f433d)
* improvie ui of queued items in status card (04783d3)
* show relative file path in diff-preview (b10b088)
* minimize collapsible animation duration in tool parts (0bf5700)
* update typewriter to adjust dynamically to increased/ decreased generation speed (7c0680f)
* remove manual webcontents bg setting (9399cbf)
* make stagewise-line-marker-removal from code blocks more reliable (4b71638)
* fix that diff history ignored manual changes in deleted and recreated files (28e9334)
* align file-modification tool-ui's (ac7a99a)
* fix diff drifts in agent diff-history usage on file edits (5eff4b9)
* add message-loading missing min-height (65622ec)
* remove references to non existing agent tool (d981aad)
* make webcontents-background white to match browser behaviour (8fc8218)
* simplify selected-element preview-card (7a3462c)
* fix chat-input blur on app-switch between desktop apps (50f888b)
* add missing error header to multi-edit (9a68404)
* make console-script-code highlighted during stream (1d1d9dd)
* add max-h to thinking part when alone (3801f52)
* fix inconsistent primary color usage (5ad9715)
* stop agent from reusing other websites css tokens when getting inspiration (4426bbb)
* make agent ignore lsp diagnostics related to formatting (7383635)
* add hover-state to suggestions links (2d183fe)
* fix hovering-behaviour of nested interactive elements (59125f4)
* fix error message layout in chat (7e565a6)
* fix code review page (abd2175)
* add tw config for color-modifiers to support custom utilities (1eac058)
* fix param route path for auth handler (e05fbdd)
* prevent errors for destroyed objects on shutdown (dc4c995)
* fix fetching of inspiration websites in homepage and add correct logo (3ba6ae9)
* avoid opening other browsers (624a6ba)
* fix stagewise-md location and model selection (1542407)
* dont send notifcation action functions over to clients (f1f4a8b)
* add missing bufferutil (43edaab)
* some adaptations for linux platform building (e86427a)
* corrected paths for dmg building (c784eff)
* update naming scheme of artifacts (6f239cc)
* correctly bundle all native deps (3c83ead)

### Other Changes

* clean up context comnpression and helper types (4b5ac87)
* remove auto-screenshots from elements (8a3240c)
* make public api call handling based on agent state that we control (a403e5b)
* relocate STAGEWISE.md to .stagewise/PROJECT.md (1037fc3)
* allow async onCreate hooks in base-agent (7ef373e)
* add 'onCreated' hook to base-agent for auto-sending of user messages (9c00158)
* break footer-status-card into section-components (4dfc0ff)
* delete runtime-interface and use runtime-node directly (41aba67)
* delete deprecated agent service make storybook use the new chat-agent (14b38cd)
* remove unused agent-service folder (35081cc)
* remove deprecated agent-service dependencies and rename diff-history (69456ef)
* add onTeardown to base agent (b3782f7)
* wire up new diff-history service with new agent (37c4191)
* fix smaller bugs from auth callbacks and favicon db access (b60823d)
* rm unused imports and variables (ebf22e8)
* make ToolboxService expose system prompt data (0993977)
* make hotkey bindings declarative with meta variants (e2d916e)
* refactor rich text input in chats (9455225)
* refactor agent architecture (c6660d4)
* delete unused iframe functionality from previous version (52c66ff)
* turn the settings icon in the chat-panel into a dropdown (2f452e4)
* update karton-state to include pending file diffs (5a9e697)
* add utilities for diff-functionality in diff-history-service (b72de97)
* add db migration-utilities and schema for sqlite service-dbs (1e89790)
* rename 'chat-bubble' to 'chat-message' (3d79242)
* add react devtools to electron main UI (abc97dc)
* create reusable hook for mask-effect on scrollable (196d43d)
* use custom table component with stagewise design (b56d8ef)
* re-order agent settings for preferred IDE (07022d7)
* add 'color-subtle-foreground' to standardize third text layer (e3a97b3)
* use overlayscrollbars instead of native scrollbars where applicable (888479d)
* create canonical brower-css which can be referenced (03f6922)
* rm 'border-subtler' and add 'border-strong' (ec639ab)
* align icon usage and shimmer in tool ui parts (4f37fc2)
* show only filename in code edit tool headers (ae11aa7)
* add auto-generation and sync of electron app colors (ea53df7)
* make user messages editable via normal chat input (915dc6a)
* split message-components into message-* files (1ddffd0)
* support highlighted stream of code diffs (multi-edit and overwrite) (1712904)
* simplify color tokens and use them throughout the app (ae72779)
* refactor context menu building and search engine access (9acb5c8)
* add nested layouts for internal pages (1cb302d)
* make the start page internal (0f6a18d)
* make auth work fully within our browser (ee1efdf)
* add central preferences service and adapt telemetry to this (e645772)

## 1.0.0-beta.1 (2026-01-06)

### Features

* add hotkey text to zoom (ab2cb53)

### Bug Fixes

* make line-number-section sticky in code-diff component (f751fe4)

## 1.0.0-alpha.1 (2026-01-06)

### Features

* add hotkey text to zoom (ab2cb53)

### Bug Fixes

* make line-number-section sticky in code-diff component (f751fe4)

All notable changes to the browser app will be documented in this file.

