# Mini Apps — Examples

Each example follows the recommended workflow: create files with native file tools (`overwriteFile`), then use the sandbox only for opening and messaging.

---

## Minimal App

A simple static app with inline styles.

### File: `apps/hello/index.html`

Create with `overwriteFile`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 1rem;
      max-width: 100%;
      overflow-x: hidden;
    }
  </style>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a minimal mini app.</p>
</body>
</html>
```

### Open (sandbox)

```js
await API.openApp("hello");
```

---

## Multi-File App

An app split into separate HTML, CSS, and JS files for maintainability.

### File: `apps/dashboard/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="root"></div>
  <script src="script.js"></script>
</body>
</html>
```

### File: `apps/dashboard/styles.css`

```css
* { box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 1rem;
  max-width: 100%;
  overflow-x: hidden;
}
.card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}
.card h3 { margin: 0 0 0.5rem; }
```

### File: `apps/dashboard/script.js`

```js
const root = document.getElementById("root");
root.innerHTML = `
  <h2>Dashboard</h2>
  <div class="card"><h3>Status</h3><p>All systems operational.</p></div>
  <div class="card"><h3>Activity</h3><p>12 events today.</p></div>
`;
```

### Open (sandbox)

```js
await API.openApp("dashboard");
```

### Iterating

After editing any file with `multiEdit`, reload:

```js
await API.openApp("dashboard"); // reloads the iframe
```

---

## Interactive Picker with Bidirectional Messaging

A complete example showing the sandbox sending data to the app, and the app sending user selections back.

### File: `apps/picker/index.html`

Create with `overwriteFile`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 1rem;
      max-width: 100%;
      overflow-x: hidden;
    }
    button {
      padding: 0.5rem 1rem;
      margin: 0.25rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      background: #fff;
    }
    button:hover { background: #f0f0f0; }
    #status {
      margin-top: 1rem;
      padding: 0.5rem;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <h3>Pick an option</h3>
  <div id="options"></div>
  <div id="status">Waiting for data...</div>
  <script>
    const optionsEl = document.getElementById("options");
    const statusEl = document.getElementById("status");

    // Receive options from sandbox
    window.addEventListener("message", (event) => {
      const { action, items } = event.data;
      if (action === "setOptions") {
        optionsEl.innerHTML = "";
        items.forEach(item => {
          const btn = document.createElement("button");
          btn.textContent = item.label;
          btn.onclick = () => {
            // Send selection back to sandbox
            window.parent.postMessage({ action: "selected", itemId: item.id }, "*");
            statusEl.textContent = "Selected: " + item.label;
          };
          optionsEl.appendChild(btn);
        });
        statusEl.textContent = "Choose an option above.";
      }
    });
  </script>
</body>
</html>
```

### Step 1: Open and register listener (sandbox)

```js
await API.openApp("picker");

// Register listener for user selections
globalThis.pickerMessages = [];
globalThis._unsubPicker = API.onMessage("picker", (msg) => {
  globalThis.pickerMessages.push(msg);
});

// Send options to the app
await API.sendMessage("picker", {
  action: "setOptions",
  items: [
    { id: 1, label: "Option A" },
    { id: 2, label: "Option B" },
    { id: 3, label: "Option C" },
  ]
});
```

### Step 2: Read user selections (later sandbox call)

```js
return globalThis.pickerMessages;
// e.g. [{ action: "selected", itemId: 2 }]
```

### Step 3: Clean up (sandbox)

```js
if (globalThis._unsubPicker) {
  globalThis._unsubPicker();
  globalThis._unsubPicker = null;
}
globalThis.pickerMessages = [];
```

---

## Message Accumulation Pattern

A reusable pattern for collecting messages from any mini app across multiple sandbox invocations:

```js
// IIFE 1: Register listener
globalThis.appMessages = globalThis.appMessages || [];
globalThis._unsubApp = API.onMessage("my-app", (msg) => {
  globalThis.appMessages.push(msg);
});
```

```js
// IIFE 2: Read collected messages
return globalThis.appMessages;
```

```js
// IIFE 3: Clean up
if (globalThis._unsubApp) {
  globalThis._unsubApp();
  globalThis._unsubApp = null;
}
globalThis.appMessages = [];
```
