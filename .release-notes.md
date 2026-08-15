## 1.29.0 (2026-08-15)

### Features

* show provider subscription usage limits (9ce138e)
* add external coding agent integrations (a92f180)
* show detected Codex worktree setup (04681bf)
* support Codex worktree setup scripts (3fd1e94)
* add xAI Grok 4.5 model support (32d7d0a)
* add chat archiving (4f57272)
* add external skills onboarding step (380fe44)
* add zoomable media tabs (5b9f8a6)
* support isolated dev instances (4108d86)

### Bug Fixes

* discard stale ACP session setup (a78f163)
* bundle spawn dependency for packaged builds (40a307b)
* handle provider usage edge cases (0a99d28)
* preserve approval denial reasons on agent stop (6215bdb)
* harden ACP lifecycle cleanup (a916952)
* handle ACP edge cases (b5d2ca8)
* harden ACP session and approval handling (9b2e238)
* address external agent review findings (3d7fc6f)
* add missing mimetypes for linux makers (bb99ae3)
* tolerate attachment cleanup failures (b95d589)
* prevent errors after archiving chats (6d9b7ae)
* guard URL handling when window is destroyed (f15a7b9)
* prioritize replies to active questions (379ef67)
* remove trailing context menu separators (2e42dfb)
* remove hidden context menu items (4e8d07e)
* prevent skill discovery from blocking startup (2b8fd02)
* correct SVG sizing in zoomable previews (dc9199c)
* prevent optimistic rendering for queued implement messages (065cf5f)
* address queued message edge cases (0ce1495)
* improve queued message handling (045bf02)
* surface isolated profile cleanup errors (9480a1a)
* preserve encrypted data in isolated Windows instances (4ed1981)
* preserve HMR for isolated dev instances (0f895e5)

### Other Changes

* clarify agent and model source grouping (f034f0c)

