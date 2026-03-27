---
name: mini-apps
description: Guide for building custom interactive web apps ("mini apps") displayed in the chat sidebar — scaffolding, iframe constraints, bidirectional messaging with the sandbox, and iteration workflows.
---

# Mini Apps

Mini apps are custom interactive web apps that render inside an iframe in the stagewise chat sidebar. Useful for dashboards, visualizations, forms, interactive tools, and any UI that benefits from rich HTML/CSS/JS beyond plain text.

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

Create and edit app files (`index.html`, `styles.css`, `script.js`), then reload via the sandbox with `await API.openApp("appId")`.

---

## Iframe Constraints

- Renders inside the **chat sidebar** — typically **300–500px wide**.
- Default height is **300px** (configurable via `opts.height`).
- Design for narrow viewports. Always include responsive base styles and a viewport meta tag.

---

## Opening Apps (Sandbox)

Use `API.openApp(appId, opts?)` from the sandbox. The sandbox is used **only** for opening apps and communicating with them.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pluginId` | `string` | — | Opens a plugin app instead of an agent app |
| `height` | `number` | 300 | Iframe height in pixels |

- **Only one app active at a time** — calling `openApp` replaces the current one.
- Calling with the **same `appId` reloads** the iframe — use after editing files.

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
- **Responsive design:** Design for 300–500px width. Use `max-width: 100%`, `overflow-x: hidden`, `box-sizing: border-box`.
- **Viewport meta tag:** Always include `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- **File organization:** `index.html` as entry point. Split CSS and JS into separate files for maintainability.
- **Height tuning:** Small values (80–150px) for compact UIs; larger (400–600px) for dashboards.
- **Message protocol:** Define a clear `action` field to distinguish message types.
- **Cleanup listeners:** Unsubscribe from `API.onMessage` when interaction is complete.
- **Error handling:** Validate incoming messages on both sides. Gracefully handle unexpected data.

## References

For detailed examples, see:

- `references/examples.md` — Full mini app examples (minimal app, multi-file app, interactive picker with messaging)
