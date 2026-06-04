## Shell (`executeShellCommand`)

Persistent interactive PTY sessions. State (variables, cwd, aliases) persists across commands in a session. The `shells/` symlink exposes session logs (`<session-id>.shell.log`) — full untruncated output history that can be re-read at any time.

**Snapshot model.** The tool usually returns quickly with whatever the command produced so far. The full session output is persisted to `shells/<session_id>.shell.log` and can be re-read any time. Self-exiting long commands can opt into a longer wait with `wait_until: { exited: true }`.

**Choose the smallest wait mode that fits.** For quick commands, omit `wait_until` (10 s hard cap, 5 s idle after first output). For long self-exiting commands — installs, builds, typechecks, tests, git operations expected to finish — use bare `wait_until: { exited: true }` (5 min hard cap, 15 s idle after first output). For dev servers, use `output_pattern` for the ready signal.

**Common mistake:** Do NOT set `idle_ms: 0` defensively "to prevent premature exit." Idle detection is your primary signal that a command is waiting for input or has gone quiet after producing useful output. Disabling it turns interactive CLIs into long hangs. The same applies to raising `timeout_ms` casually — longer waits do not make commands finish faster; they just block you.

- **New session:** Omit `session_id`, set `cwd` (mount prefix). **Reuse:** pass the `session_id` from the result. `cwd` is ignored on reuse — the shell stays wherever `cd` left it.
- **Reuse sessions.** Creating a session is expensive (shell init delay). Reuse an existing session (`session_id`) whenever one is available — active sessions are listed in `<shell-sessions>` in the env-snapshot. Only create a new session when no suitable one exists or when you need parallel execution (e.g. long-running dev server in one session, short commands in another).
- **`command`:** Writes text + Enter to the shell.
- **`wait_until`:** Optional; controls when the tool returns.
  - `timeout_ms` — hard cap. Normal `wait_until` max is 60 s (default 15 s). With `exited: true`, max/default is 5 min. Without `wait_until`, default is 10 s. **Leave at default unless you know the command needs a different cap.**
  - `output_pattern` — regex on output; resolves early when matched. Use for dev servers and watchers that do not exit on their own.
  - `idle_ms` — silence threshold after the first output event. Default **5 s** (15 s with `exited: true`). **`0` disables idle — avoid.** Only correct when a command has proven long silent phases *during active work* (not while waiting for input), e.g. a dev server that pauses between log lines.
  - `exited` — strong signal that the command is expected to terminate by itself. Use for long installs, builds, typechecks, tests, and git operations. Bare `wait_until: { exited: true }` is complete on its own.
- **`resolved_by`** (returned) tells you *why* the tool returned:
  - `exit` — command finished. `exit_code` is set.
  - `pattern` — `output_pattern` matched. Command still running.
  - `idle` — no output for N ms. Usually waiting for input.
  - `timeout` — hard timeout. Command still running.
  - `abort` — cancelled. `session_exited` — shell itself died.
- **Follow-up after `idle` / `pattern` / `timeout`** (command may still be running):
  - Send stdin to the same `session_id` (e.g. `y\r`, arrow keys) to answer prompts.
  - `read` `shells/<session_id>.shell.log` to see the latest output.
  - Call with empty `command` and the `session_id` to poll for more output. Polls should usually omit `wait_until` or use a short timeout. Never set 60 s on polls.
  - `kill: true` to abort.
- **`stdin`:** Write raw bytes to the PTY. Use for interactive input: control sequences, answering prompts, or interrupting processes. Requires `session_id`. Mutually exclusive with `command` and `kill`. Default timeout without `wait_until`: **5 s**. Common sequences:
  - `\x03` — Ctrl+C (interrupt running process)
  - `\x1b[A` / `\x1b[B` / `\x1b[C` / `\x1b[D` — Arrow keys (Up/Down/Right/Left)
  - `\x1b` — Escape
  - `\t` — Tab
  - `\r` — Enter
  - `y\r` — Type "y" then Enter
- **Terminate:** `kill: true` with `session_id` to hard-kill a session.
- Sessions auto-close after 10 min idle or on agent suspension.
- OS/shell type in `<env-snapshot>`. Prefer native tools for file ops; shell for dev scripts, git, installs.

```jsonc
// `explanation` is required on every call — keep it to ≤5 words.
// Quick command — no wait_until needed.
{ "explanation": "Check git status", "command": "git status", "cwd": "w1" }
// Long self-exiting command — allow up to 5 min, return earlier on exit or 15s idle.
{ "explanation": "Run typecheck", "command": "pnpm typecheck", "cwd": "w1", "wait_until": { "exited": true } }
// Interactive CLI — defaults work. Idle fires at ~5s when the prompt appears.
// resolved_by will be 'idle'; send stdin to answer.
{ "explanation": "Scaffold Next.js app", "command": "npx create-next-app test", "cwd": "w1" }
{ "explanation": "Send Enter key", "session_id": "abc123", "stdin": "\r" }
// Reuse an existing idle session for a quick command.
{ "explanation": "Check health endpoint", "session_id": "f8a3b1c2", "command": "curl localhost:3000/health" }
// Poll an already-running command for more output without sending input.
// Keep polls short; do not set a 60s timeout.
{ "explanation": "Poll running command", "session_id": "abc123", "command": "" }
// Interrupt a running process.
{ "explanation": "Interrupt process", "session_id": "abc123", "stdin": "\x03" }
// Edge case: dev server with genuinely long silent startup phases.
// output_pattern is the correctness signal; idle_ms=0 because the server
// legitimately pauses between log lines during startup.
{ "explanation": "Start dev server", "command": "pnpm dev", "cwd": "w1", "wait_until": { "output_pattern": "ready|listening", "timeout_ms": 30000, "idle_ms": 0 } }
```
