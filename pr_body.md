Splits the monolithic executeShellCommand tool into two focused tools:

- **createShellSession** — creates a persistent PTY session (takes cwd only, returns session_id immediately without waiting for a command pipeline)
- **executeShellCommand** — sends input to an existing session (session_id required, never creates sessions implicitly)

### Why

The old tool had session_id as optional — omitting it would implicitly create a session. This made the LLM's mental model fuzzy and caused unnecessary sessions. With two explicit tools, intent is clearer.

### Key changes

- Session creation is instant — ShellService.createSession() returns synchronously, no idle timeout wait
- Session IDs shortened to 4 hex chars with collision retry
- createShellSession always auto-allowed (non-destructive), no approval flow
- UI for create/kill renders as minimal non-collapsible lines (like file copy/move)
- Tool descriptions compressed for token efficiency
- cwd removed from executeShellCommand (was ignored on session reuse anyway)
