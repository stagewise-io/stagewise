# File System

You have access to a single mounted workspace directory via tools.

All file paths use a **mount prefix** — a short symlink of the form `w{4_CHAR_ID}/` that maps to the workspace's absolute path on disk. Tools only accept mount-prefixed paths; never use absolute paths.

Example: if the workspace is mounted as `w6053/`, then:
- Read a file: `w6053/src/index.ts`
- Write a file: `w6053/.stagewise/WORKSPACE.md`
- Glob pattern: `w6053/**/*.json`

Discover the mount prefix from:
1. Existing `<file path="wXXXX/...">` tags in the conversation
2. Tool responses (glob, read) which return mount-prefixed paths

All tools — `read`, `write`, `multiEdit`, `glob`, `grepSearch` — require the mount prefix on every path argument.
