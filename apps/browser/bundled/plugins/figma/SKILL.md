---
name: figma
description: Complete guide for the Figma plugin — REST API access, real-time selection monitoring via CDP, and the figma-app interactive UI. Read this IMMEDIATELY when the user asks to work with Figma.
---

# Figma Plugin

This plugin provides three capabilities:
1. **Figma REST API** access for reading designs, components, and images.
2. **Real-time selection monitoring** — watch which nodes the user selects in a Figma tab via CDP.
3. **figma-app** — an interactive UI in a browser tab that displays the current selection as live badges.

## Querying the Current Selection (IMPORTANT)

The user's Figma selection is **not** automatically attached to their
message. Before acting on any Figma-related request, **always** query
the latest selection so you know which nodes the user is referring to:

```js
const selectedNodes = globalThis.figmaSelection || [];
return selectedNodes;
```

If the result is an empty array and the user clearly expects a
selection, remind them to select elements in the Figma tab first.

Do this at the **start** of every Figma-related turn — even if you
set up monitoring earlier, the selection may have changed since then.

---

## Authentication

Request the stored Figma credential. The `token` field is an opaque
placeholder that the sandbox fetch proxy substitutes automatically —
pass it directly in the `X-Figma-Token` header and never try to
decode or transform it.

```js
const cred = await API.getCredential('figma-pat');
if (!cred) {
  return 'Figma credential is not configured. Ask the user to add a Figma Personal Access Token in Settings → Security → Personal access tokens.';
}
```

## Making Requests

Always use `fetch` with the credential header:

```js
async function figmaGet(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { 'X-Figma-Token': cred.token },
  });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

## Key Endpoints

### Get a file
`GET /v1/files/:file_key`
Returns the full document tree. Add `?depth=1` or `?depth=2` to limit
nesting and reduce response size.

### Get file nodes
`GET /v1/files/:file_key/nodes?ids=:node_ids`
Fetch specific nodes by comma-separated IDs (e.g. `1:2,3:4`).
Much faster than fetching the entire file.

### List components
`GET /v1/files/:file_key/components`
Returns published components in the file with their metadata.

### Export images
`GET /v1/images/:file_key?ids=:node_ids&format=png&scale=2`
Renders nodes as images. Supported formats: `png`, `jpg`, `svg`, `pdf`.

### List project files
`GET /v1/projects/:project_id/files`
Lists all files in a project.

### Get file styles
`GET /v1/files/:file_key/styles`
Returns published styles (colors, text, effects, grids).

## Extracting a File Key

A Figma URL looks like:
`https://www.figma.com/design/<file_key>/<file_name>?node-id=<node_id>`

The file key is the first path segment after `/design/` (or `/file/` in
older URLs).

## Important Rules

- Always request credentials with `API.getCredential('figma-pat')` before
  making any Figma API call. If it returns `null`, tell the user to
  configure the token.
- Use `?depth=` when fetching files to avoid huge payloads.
- Prefer `/files/:key/nodes?ids=` over fetching the whole file when you
  only need specific frames or components.
- Rate limits: Figma allows ~30 requests/minute per token. Avoid tight
  loops; batch node IDs into a single request where possible.
- Image export URLs returned by `/v1/images` expire after 14 days.

---

## Selection Monitoring (CDP)

Whenever the user asks to work with Figma designs, **eagerly set up
selection monitoring** so you can see which nodes the user selects in
the Figma tab. Briefly tell the user that monitoring is active and
they can start selecting elements.

The flow uses `Runtime.addBinding` to create a push channel from the
Figma tab into the sandbox, combined with a polling script injected
via `Runtime.evaluate`.

### Full setup recipe

Run this in a **single IIFE** for each Figma tab. The entire setup is
fire-and-forget — it does not block future IIFEs.

```js
// 1. Open the figma-app so the user sees live selection badges
await API.openApp('figma-app', { pluginId: 'figma', title: 'Figma Selection' });

// 2. Identify the Figma tab (use the tab whose URL contains figma.com/design/)
const tabId = "<figma-tab-id>";

// 3. Inject a Runtime binding so the tab can push data to the sandbox
await API.sendCDP(tabId, "Runtime.addBinding", { name: "sendToAgent" });

// 4. Subscribe to binding calls — accumulate AND forward to app
globalThis.figmaSelection = globalThis.figmaSelection || [];
globalThis._unsubFigmaBinding = API.onCDPEvent(tabId, "Runtime.bindingCalled", (event) => {
  if (event.name === "sendToAgent") {
    try {
      const payload = JSON.parse(event.payload);
      // Store for agent reads
      globalThis.figmaSelection = payload.nodes || [];
      // Forward to figma-app for live badge rendering
      API.sendMessage('figma-app', {
        type: 'selectionChanged',
        nodes: payload.nodes || [],
        timestamp: payload.timestamp,
      }, { pluginId: 'figma' });
    } catch {}
  }
});

// 5. Inject a polling script into the Figma tab
//    It reads figma.currentPage.selection every 200ms and pushes
//    changes through the binding.
await API.sendCDP(tabId, "Runtime.evaluate", {
  expression: `
    (function() {
      if (window.__figmaSelectionWatcher) return; // prevent duplicates
      window.__figmaSelectionWatcher = true;
      window.__lastSelKey = '';
      setInterval(() => {
        try {
          if (typeof figma === 'undefined' || !figma.currentPage) return;
          const sel = figma.currentPage.selection;
          const key = sel.map(n => n.id).join(',');
          if (key === window.__lastSelKey) return;
          window.__lastSelKey = key;
          window.sendToAgent(JSON.stringify({
            timestamp: Date.now(),
            nodes: sel.map(n => ({
              id: n.id,
              name: n.name,
              type: n.type,
              width: n.width,
              height: n.height,
            })),
          }));
        } catch {}
      }, 200);
    })();
  `,
});

API.output("Figma selection monitoring active. Select elements in the Figma tab — they will appear in the Figma App preview tab.");
```

### Reading the current selection in a later IIFE

```js
// Returns the latest list of selected nodes (or [] if none)
return globalThis.figmaSelection;
```

### Cleaning up

```js
if (globalThis._unsubFigmaBinding) globalThis._unsubFigmaBinding();
await API.closeApp();
```

### Multiple Figma tabs

If the user opens additional Figma tabs, run the setup recipe again
with the new `tabId`. Each tab gets its own binding + polling script.
The `onCDPEvent` callback updates the same `globalThis.figmaSelection`
so the agent always sees the most recent selection regardless of which
tab it came from.

---

## Available Apps

This plugin provides interactive apps that can be opened in browser tabs using `API.openApp()`.

| App ID | Description |
|--------|-------------|
| `figma-app` | Displays the user's current Figma node selection as live badges. Also accepts arbitrary data messages from the agent. |

### Opening the app

```js
await API.openApp('figma-app', { pluginId: 'figma', title: 'Figma Selection' });
```

### Closing the app

```js
await API.closeApp();
```

The app renders in a dedicated preview tab. Calling `API.openApp()` again opens a refreshed preview tab.
The user can also dismiss it manually.

### Sending data to the app

The figma-app listens for messages with a `type` field. The primary
message type is `selectionChanged`:

```js
await API.sendMessage('figma-app', {
  type: 'selectionChanged',
  nodes: [
    { id: '1:23', name: 'Header Frame', type: 'FRAME', width: 1440, height: 900 },
    { id: '4:56', name: 'Button', type: 'INSTANCE', width: 200, height: 48 },
  ],
  timestamp: Date.now(),
}, { pluginId: 'figma' });
```

You can also send arbitrary data (the app will render it as JSON):

```js
await API.sendMessage('figma-app', {
  type: 'custom',
  data: someObject,
}, { pluginId: 'figma' });
```

### Receiving messages from the app

Register a listener that persists across IIFE executions:

```js
globalThis.figmaAppMessages = globalThis.figmaAppMessages || [];
API.onMessage('figma-app', (msg) => {
  globalThis.figmaAppMessages.push(msg);
}, { pluginId: 'figma' });
```

Read collected messages in a later IIFE:

```js
return globalThis.figmaAppMessages;
```
