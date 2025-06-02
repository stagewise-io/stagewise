# Multi-Window Discovery System

The stagewise VS Code extension supports running multiple VS Code windows
simultaneously, with each instance running on a different port. The toolbar can
discover and connect to any of these instances.

## How It Works

### 1. Port Assignment

- Each VS Code window with the stagewise extension gets a unique port
- Default port range: `5746-5756` (10 possible windows)
- First available port is used when extension activates

### 2. Discovery Process

The toolbar can discover all running VS Code instances by:

1. **Port Scanning**: Check each port in the range (5746-5756)
2. **Ping Test**: GET request to `/ping/stagewise` endpoint
3. **Session Info**: Call `getSessionInfo` RPC method to get window details

### 3. Window Information

Each VS Code window provides:

```typescript
{
  sessionId: string;           // Unique session identifier
  workspaceName: string | null; // Workspace/project name
  workspaceFolders: string[];   // List of open workspace folders
  activeFile: string | null;   // Currently active file path
  appName: string;             // VS Code app name (e.g., "Cursor", "VS Code")
  windowFocused: boolean;      // Whether window has focus
  displayName: string;         // Human-readable identifier for UI
  port: number;               // Port this instance runs on
}
```

## Toolbar Implementation Example

```typescript
// Discovery function for the toolbar
async function discoverVSCodeWindows() {
    const windows = [];

    for (let port = 5746; port <= 5756; port++) {
        try {
            // 1. Test if extension is running on this port
            const pingResponse = await fetch(
                `http://localhost:${port}/ping/stagewise`,
            );

            if (await pingResponse.text() === "stagewise") {
                // 2. Get detailed session information
                const bridge = createToolbarBridge(port);
                const sessionInfo = await bridge.call.getSessionInfo({});

                windows.push({
                    port,
                    ...sessionInfo,
                });
            }
        } catch (error) {
            // Port not available or no extension running
            continue;
        }
    }

    return windows;
}

// UI Component for window selection
function WindowSelector({ onSelectWindow }) {
    const [windows, setWindows] = useState([]);

    useEffect(() => {
        discoverVSCodeWindows().then(setWindows);
    }, []);

    return (
        <select onChange={(e) => onSelectWindow(e.target.value)}>
            <option value="">Select VS Code Window</option>
            {windows.map((window) => (
                <option key={window.sessionId} value={window.sessionId}>
                    {window.displayName} - Port {window.port}
                </option>
            ))}
        </select>
    );
}
```

## Communication

Once a window is selected:

1. **Store the sessionId** for the selected window
2. **Include sessionId** in all RPC requests
3. **Extension validates** the sessionId matches current window

```typescript
// Example: Send prompt to specific window
await bridge.call.triggerAgentPrompt({
    sessionId: selectedSessionId,
    prompt: "Fix this component",
    files: ["src/components/Button.tsx"],
});
```

## Debugging

Extension logs to console when starting:

```
[Stagewise] Starting extension on port 5747 for window: my-project-a1b2c3d4
[Stagewise] Extension bridge ready on port 5747
```

Use VS Code Developer Tools (View → Developer Tools) to see these logs.

## Error Handling

- **Port conflicts**: Extension automatically finds next available port
- **Session mismatch**: RPC calls validate sessionId matches current window
- **Discovery failures**: Toolbar should handle ports that don't respond
  gracefully
