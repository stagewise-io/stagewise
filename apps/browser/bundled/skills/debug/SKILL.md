---
name: Debug
description: Use logging calls for in-depth debugging via local log files
user-invocable: true
agent-invocable: true
---

Inject `fetch()` logging calls into user code that send structured data to a local HTTP ingest server. Log entries accumulate in JSONL files you can read for analysis.

## Prerequisites

The env-snapshot includes a `logIngest` field once the ingest server is running:

```
logIngest: { port: <number>, token: "<uuid>" }
```

If `logIngest` is `null`, the server has not started yet — wait for an env-change.

## Protocol

### 1. Create a log channel

Use `write` to create an empty JSONL file. The channel name must be kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`).

```
write('logs/react-renders.jsonl', '')
```

This registers the channel. You will receive a `log-channel-created` env-change.

### 2. Construct the ingest URL

```
http://127.0.0.1:{port}/ingest/{channel-name}?token={token}
```

Example: `http://127.0.0.1:54321/ingest/react-renders?token=abc-123`

### 3. Inject instrumentation code

Wrap **all** injected debug code in region markers for easy identification and removal:

```js
// #region @stagewise-debug
fetch('http://127.0.0.1:54321/ingest/react-renders?token=abc-123', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    level: 'info',
    source: 'useEffect-mount',
    data: { component: 'App', props: { userId: 42 } }
  })
}).catch(() => {});
// #endregion @stagewise-debug
```

**Rules:**
- Always wrap in `// #region @stagewise-debug` / `// #endregion @stagewise-debug`.
- Always `.catch(() => {})` — instrumentation must never break user code.
- Keep payloads small. The `source` field distinguishes instrumentation points.

### 4. POST body schema

```json
{
  "level": "info" | "warn" | "error" | "debug" | "log",
  "source": "descriptive-label",
  "data": { ... }
}
```

Only `data` is required. `level` defaults to `"log"`, `source` is optional.

### 5. Read logs

```
read('logs/react-renders.jsonl')
```

Each line is a JSON object: `{ "ts": 1713000000000, "level": "info", "source": "useEffect-mount", "data": { ... } }`.

Use `grepSearch` with `mount_prefix` targeting `logs` for filtered searches.

### 6. Env-change notifications

You receive these for owned log channels only:

| Event | Attributes | Meaning |
|-------|-----------|---------|
| `log-channel-created` | `channel` | New channel file appeared |
| `log-entries-added` | `channel`, `newLines` | New lines were appended |
| `log-channel-removed` | `channel` | Channel file was deleted |

### 7. Size limits

- **64 KB** max per POST body. Split large payloads.
- **2 MB** max per log file. The server returns `409` when full.

When a file is full: read and analyze the data, then truncate with `write('logs/{name}.jsonl', '')` and continue.

### 8. Cleanup (mandatory)

When debugging is complete, **always** perform both steps:

1. **Remove instrumentation** — delete all `// #region @stagewise-debug` … `// #endregion @stagewise-debug` blocks from user code.
2. **Delete log files** — `delete('logs/{name}.jsonl')` for every channel you created.

Never leave debug instrumentation or log files behind.

## Notes

- **Browser-side code**: The ingest server handles CORS (`Access-Control-Allow-Origin: *`). `fetch()` works from any origin.
- **Node.js server code**: `fetch()` works directly to `127.0.0.1`.
- **Write buffering**: Entries are buffered and flushed every 500ms or 50 entries. There may be a short delay before new entries appear in the file.
