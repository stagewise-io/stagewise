---
name: Preview
description: Create an interactive design-preview in the chat
user-invocable: true
agent-invocable: false
---

Build a **mini-app** to fulfill the request. Use the `apps/` directory and `API.openApp()` as documented in the Application Environment section.

## Workflow

1. **Scaffold** — create `apps/{appId}/index.html` (+ optional `styles.css`, `script.js`).
2. **Design for sidebar** — the iframe is **300–500px wide**. Keep layouts single-column, responsive, and overflow-safe (`max-width: 100%; overflow-x: hidden`).
3. **Iterate** — use file tools (`multiEdit`, `overwriteFile`) for edits, then call `API.openApp(appId)` again to reload.

## Rules

- One `index.html` per app. Sibling assets resolve via relative paths (`./styles.css`).
- Set `opts.height` on `openApp` when the default 300px is wrong for the content.
- Prefer self-contained HTML (inline or sibling files) — no external build step.
- Use `API.sendMessage` / `API.onMessage` only when bidirectional communication is needed.