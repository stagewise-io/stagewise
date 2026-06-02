---
name: Preview
description: Create an interactive design-preview in a browser tab
user-invocable: true
agent-invocable: false
---

Build a **mini-app** to fulfill the request. Use the `apps/` directory and `API.openApp(appId, { target: 'tab', title: 'Readable preview title' })` as documented in the Application Environment section.

## Workflow

1. **Scaffold** — create `apps/{appId}/index.html` (+ optional `styles.css`, `script.js`).
2. **Design for a full browser tab** — the preview opens on an internal `stagewise://internal/preview/{appId}` page, so use responsive layouts that work from narrow to full-width viewports.
3. **Open in tab** — call `await API.openApp(appId, { target: 'tab', title: 'Readable preview title' })`. The title is shown in the tab breadcrumbs. The returned `{ tabId }` can be used with `API.sendCDP()` if the preview needs inspection.
4. **Iterate** — use file tools (`multiEdit`, `overwriteFile`) for edits, then call `API.openApp(appId, { target: 'tab', title: 'Readable preview title' })` again to open the refreshed preview.

## Rules

- One `index.html` per app. Sibling assets resolve via relative paths (`./styles.css`).
- Prefer self-contained HTML (inline or sibling files) — no external build step.
- Do not open preview apps in the chat. Use `target: 'tab'`.
- Use `API.sendMessage` / `API.onMessage` only when bidirectional communication is needed.