---
name: mini-apps
description: Guide for building custom interactive web apps ("mini apps") displayed in browser tabs — scaffolding, iframe constraints, bidirectional messaging with the sandbox, and iteration workflows.
---

# Mini Apps

Mini apps are custom interactive web apps that render in dedicated stagewise browser tabs. Useful for dashboards, visualizations, forms, interactive tools, and any UI that benefits from rich HTML/CSS/JS beyond plain text.

---

## Apps Directory (`apps/`)

The `apps/` mount is always available with full read-write permissions. Each app lives in its own subfolder with `index.html` as the required entry point. Optional sibling assets (`styles.css`, `script.js`, images, etc.) are resolved via relative references.

```
apps/{appId}/
  index.html      ← entry point (required)
  styles.css      ← optional
  script.js       ← optional
```

---

## Writing App Files

Create and edit app files (`index.html`, `styles.css`, `script.js`), then open or reload via the sandbox with `await API.openApp("appId", { title: 'Readable title' })`.

---

## Iframe Constraints

- Renders inside a dedicated browser tab with normal Stagewise browser chrome.
- The app itself is sandboxed in an `app://` iframe inside a trusted `stagewise://internal/preview/{appId}` shell.
- Design responsively. Always include responsive base styles and a viewport meta tag.

---

## Opening Apps (Sandbox)

Use `API.openApp(appId, opts?)` from the sandbox. The sandbox is used **only** for opening apps and communicating with them.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pluginId` | `string` | — | Opens a plugin app instead of an agent app |
| `title` | `string` | — | Human-readable tab breadcrumb label |
| `target` | `'tab'` | `'tab'` | Explicit tab target; retained for compatibility/documentation |
| `setActive` | `boolean` | `true` | Whether the preview tab should become active immediately |

- `API.openApp()` always opens an internal preview tab with a sandboxed `app://` iframe.
- Calling with the **same `appId` opens a refreshed tab** — use after editing files.

---

## Bidirectional Messaging

Apps and the sandbox communicate via `postMessage`.

**Sandbox → App:** `API.sendMessage(appId, data, opts?)` — sends a JSON-serializable message to the active app.

**App → Sandbox:** `API.onMessage(appId, callback, opts?)` — registers a listener for messages the app sends via `window.parent.postMessage(data, "*")`. Returns an unsubscribe function. Listeners persist across IIFE executions; use `globalThis` to accumulate messages.

**Inside the app (HTML/JS):**

- Receive: `window.addEventListener("message", (e) => { /* e.data */ })`
- Send: `window.parent.postMessage({ action: "clicked", id: 1 }, "*")`

---

## Best Practices

- **Sandbox usage:** Use the sandbox only for `openApp`, `sendMessage`, and `onMessage`.
- **Responsive design:** Support both narrow and wide tab widths. Use `max-width: 100%`, `overflow-x: hidden`, `box-sizing: border-box`.
- **Viewport meta tag:** Always include `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- **File organization:** `index.html` as entry point. Split CSS and JS into separate files for maintainability.
- **Message protocol:** Define a clear `action` field to distinguish message types.
- **Cleanup listeners:** Unsubscribe from `API.onMessage` when interaction is complete.
- **Error handling:** Validate incoming messages on both sides. Gracefully handle unexpected data.

## References

For detailed examples, see:

- `references/examples.md` — Full mini app examples (minimal app, multi-file app, interactive picker with messaging)
