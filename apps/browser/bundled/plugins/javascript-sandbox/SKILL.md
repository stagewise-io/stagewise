---
name: javascript-sandbox
description: Best practices for using the stagewise built-in JavaScript sandbox. Explains how to access APIs for browser debugging/interaction, use external dependencies, file system access, running mini-apps, etc.
---

# JavaScript Sandbox

The sandbox is an isolated, **persistent** Node.js VM context. Data and functions stored on `globalThis` survive across calls and messages. Scripts run inside an async IIFE. The sandbox offers a standard stagewise runtime API through the global object `API`.

---

## Timeouts

- **Inactivity timeout:** 45 seconds. Each call to `API.output()` or `API.createAttachment()` resets the timer.
- **Hard cap:** 3 minutes wall-clock (non-resettable).
- **NEVER** use `await Promise.resolve()` or unbounded `while(true)` loops — these permanently block the sandbox worker.
- In loops, yield with `await new Promise(r => setTimeout(r, 0))` every ~1000 sync iterations.
- Always use bounded loops. Return partial results if hitting the limit.
- For long-running tasks, call `API.output()` periodically as a heartbeat. Split work across multiple invocations if needed.

---

## Creating Outputs

Use `API.output(data: any): void` to generate outputs. Can be called multiple times; outputs are concatenated. **NEVER** use `console.log()` or other console methods.

---

## Creating Attachments

Use `API.createAttachment(originalFileName: string, data: Buffer | string): Promise<string>`.

- `originalFileName`: user-visible name with extension (e.g. `screenshot.png`)
- `data`: binary content or base64-encoded string
- Returns the obfuscated file name in `att/` — **always** use this returned name when referencing the attachment afterwards.

---

## Chrome DevTools Protocol (CDP)

Send commands via `API.sendCDP(tabId, method, params?): Promise<any>`. Listen to events via `API.onCDPEvent(tabId, event, callback): void` (listeners persist across IIFEs; use `globalThis` to accumulate).

- **Pre-enabled** (do NOT call `.enable`): `DOM`, `CSS`, `Page`, `Runtime`, `Log`, `Console`
- **No enable method** (use directly): `Input`, `Emulation`, `IO`, `Target`, `Browser`, `SystemInfo`, `Schema`
- **All others** (e.g. `Network`, `Overlay`, `Debugger`, `Fetch`): call `<Domain>.enable` first.

---

## Filesystem Access

Sandboxed `fs` and `fsPromises` globals are available directly (also via `require('fs')`). Scoped to mounted workspaces.

- Paths use mount prefixes: `w1/src/index.ts`, `w2/package.json`. Optional if one workspace mounted.
- All mounts (`w1/`, `att/`, `apps/`, `plugins/`) share the same API — cross-mount copy/move works.
- All standard `fs` methods available (callback, sync, and promise APIs).
- **`att/`** — read-only access to attachments. Create with `API.createAttachment()`.
- **`plugins/`** — read-only access to plugin files.
- Sandbox `fs` is well-suited for binary operations and cross-mount copies.

---

## Credentials

Use `API.getCredential(typeId): Promise<string>` to retrieve stored credentials. Secret fields contain opaque placeholders auto-substituted in outgoing `fetch` calls. Plain fields contain real values.

---

## Mini Apps

Mini apps are interactive web UIs rendered in the chat sidebar. Use `API.openApp(appId, opts?)` to open one. See the **mini-apps** skill for full details on building, messaging, and best practices.

---

## Available Runtime

**Global APIs:** `Promise`, `Map`, `Set`, `Array`, `Object`, `JSON`, `Math`, `RegExp`, `Date`, `Error`, typed arrays, `setTimeout`, `setInterval`, `setImmediate`, `fetch`, `Headers`, `Request`, `Response`, `AbortController`, `URL`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`, `Buffer`, `Blob`, `FormData`, `structuredClone`, `queueMicrotask`, `crypto.randomUUID()`, `process` (shim: `env.NODE_ENV`, `nextTick`). **NO DOM or Navigator APIs** — use CDP for tab interaction.

**Node.js built-ins** (via `require()`): `buffer`, `crypto`, `events`, `path`, `querystring`, `stream`, `string_decoder`, `url`, `util`, `zlib`, `assert`. Blocked: `net`, `http`, `https`, `child_process`, `worker_threads`, `vm`.

**Dynamic imports** (via `importModule(url)`): HTTPS only, prefer `https://esm.sh/{package}?target=node`. Modules cached per session. Do NOT use `await import()`.

---

## Important Rules

- Check docs of imported modules BEFORE using them.
- Handle both default and named exports when format is unknown.
- Use `API.output()` instead of console logging.
- Use `fetch` for all network requests.
- Implement error handling with fallbacks and sensible retries.
- Split multi-step scripts into separate invocations.
- After writing or updating mini app files, use `API.openApp` to reload the app and `API.sendMessage` / `API.onMessage` for messaging.

## References

For detailed usage examples, see:
- `references/examples.md` — Common sandbox patterns (filesystem, CDP, attachments, data processing, long-running tasks)
