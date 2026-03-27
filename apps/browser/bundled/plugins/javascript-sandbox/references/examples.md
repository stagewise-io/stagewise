# JavaScript Sandbox — Usage Examples

## Reading and Listing Files

### Read a workspace file

```js
const content = await fsPromises.readFile('w1/src/index.ts', 'utf-8');
API.output(`File has ${content.split('\n').length} lines`);
return content.slice(0, 500);
```

### List files in a directory

```js
const files = await fsPromises.readdir('w1/src', { recursive: true });
return files.filter(f => f.endsWith('.ts'));
```

### Read an uploaded attachment

Read a user-uploaded file from the `att/` mount and copy it into the workspace:

```js
const content = await fsPromises.readFile('att/abc123');
API.output(`Attachment size: ${content.length} bytes`);
await fsPromises.writeFile('w1/assets/uploaded-image.png', content);
return "Copied attachment to workspace.";
```

---

## CDP and Screenshots

### Take a screenshot of the active tab

Use `Page.captureScreenshot` via CDP, then store as an attachment for multimodal inspection:

```js
const tabId = "<active-tab-id>";
const { data } = await API.sendCDP(tabId, "Page.captureScreenshot", { format: "png" });
const buf = Buffer.from(data, "base64");
const fileName = await API.createAttachment("screenshot.png", buf);
return "Screenshot saved as " + fileName;
```

### Evaluate JavaScript in a browser tab

Run arbitrary JS in the tab's page context and retrieve the result:

```js
const tabId = "<active-tab-id>";
const result = await API.sendCDP(tabId, "Runtime.evaluate", {
  expression: "document.title",
  returnByValue: true,
});
return result.result.value; // the page title
```

### Monitor network requests

Enable the Network domain first, then subscribe to events:

```js
const tabId = "<active-tab-id>";
await API.sendCDP(tabId, "Network.enable");

globalThis.networkRequests = [];
API.onCDPEvent(tabId, "Network.requestWillBeSent", (params) => {
  globalThis.networkRequests.push({
    url: params.request.url,
    method: params.request.method,
    timestamp: params.timestamp,
  });
});
```

Read collected requests in a later invocation:

```js
return globalThis.networkRequests;
```

---

## External Packages

### Import via esm.sh

Always use `importModule()` (never `await import()`). Support both named and default exports:

```js
// Named exports
const { chunk, map } = await importModule('https://esm.sh/lodash-es?target=node');
return chunk([1, 2, 3, 4, 5, 6], 2);
```

```js
// Default export
const dayjs = (await importModule('https://esm.sh/dayjs?target=node')).default;
return dayjs().format('YYYY-MM-DD');
```

---

## Data Processing

### Compress data with zlib

```js
const zlib = require('zlib');
const input = Buffer.from('hello world — repeated many times '.repeat(100));
const compressed = zlib.deflateSync(input);
return { original: input.length, compressed: compressed.length };
```

### Hash a string with crypto

```js
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('hello world').digest('hex');
return hash;
```

---

## Output Patterns

### Multi-step output with progress

Use `API.output()` to show incremental progress. Each call resets the inactivity timer:

```js
API.output("Step 1: fetching data...");
const resp = await fetch("https://api.example.com/data");
const data = await resp.json();
API.output(`Step 2: got ${data.items.length} items`);
return "Done";
```

### Long-running task with heartbeat and yielding

For CPU-intensive loops, yield periodically and emit heartbeats to avoid the 45s inactivity timeout:

```js
const results = [];
for (let i = 0; i < 1000; i++) {
  results.push(processItem(i));
  if (i % 100 === 0) {
    API.output(`Progress: ${i}/1000`);
    await new Promise(r => setTimeout(r, 0)); // yield to event loop
  }
}
return results;
```

### Persisting state across invocations

Use `globalThis` to store data that survives between separate sandbox script calls:

```js
// IIFE 1: Store data
globalThis.myData = { count: 0, items: [] };
```

```js
// IIFE 2: Read and update
globalThis.myData.count++;
globalThis.myData.items.push("new item");
return globalThis.myData;
```

---

## Fetching External APIs

### GET request with error handling

```js
const resp = await fetch("https://api.example.com/users?limit=10");
if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
const data = await resp.json();
return data;
```

### POST request with JSON body

```js
const resp = await fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test", value: 42 }),
});
if (!resp.ok) throw new Error(`API error ${resp.status}`);
return await resp.json();
```

### Using a stored credential for an authenticated request

```js
const cred = await API.getCredential('my-api-key');
if (!cred) return "Credential not configured.";

const resp = await fetch("https://api.example.com/data", {
  headers: { Authorization: `Bearer ${cred.token}` },
});
return await resp.json();
```
