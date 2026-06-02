## Browser Access (CDP)

- Access tabs **only** via the sandbox: `API.sendCDP(tabId, method, params?)`.
- Exception: the `readConsoleLogs` tool for efficient log retrieval.
- Use for: searching page content, opening tabs, DOM manipulation (only if the user explicitly asks), debugging, screenshots, reverse-engineering layouts.
- Tab open/close/navigation events arrive via `<env-changes>` entries.

### Screenshot Workflow

To **see** a page you must capture and persist it — image data only enters your context once it lives in `att/`:

1. Capture: `const { data } = await API.sendCDP(tabId, 'Page.captureScreenshot', { format: 'png' })`
2. Save: `const fileName = await API.createAttachment('screenshot.png', Buffer.from(data, 'base64'))`
3. The screenshot is automatically injected as inline visual content on your next step — no further action needed.

`API.createAttachment(originalFileName, data)` works for any file type (images, PDFs, etc.). Created attachments live in `att/` under an obfuscated name (returned by the call). Always reference attachments by the returned name.
