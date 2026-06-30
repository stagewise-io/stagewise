## 1.16.0 (2026-06-30)

### Features

* add Sonnet 5 and hide Sonnet 4.6 by default (6c152ea)
* add new file creation in file tree (53e18b7)
* distinguish MiniMax Token Plan from Pay-as-you-go auth (e240bb5)

### Bug Fixes

* guard in-flight createFile results against workspace switch (b091d49)
* clear pending file creation state on workspace switch (99a5341)
* handle pagination stall in new file rename flow and remove unused var (f182c61)
* address review — simplify Token Plan validation to Global-only (2721a06)

### Other Changes

* remove preferences migration for default-disabled models (8f61a09)
* eliminate redundant git calls in startup worktree cleanup scan (ca9ee48)

