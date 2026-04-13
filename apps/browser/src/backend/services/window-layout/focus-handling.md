# Focus & Z-Order Management

> **Audience:** Coding agents and new developers working on the stagewise browser app.
> **Scope:** How Electron view layering, mouse interactivity, and keyboard focus work in the `window-layout` service.

---

## 1. The Two-Layer View Model

The stagewise browser window is a single Electron `BaseWindow`. Its `contentView` holds exactly **two child `WebContentsView`s** that are stacked on top of each other:

| View | Source | Contains |
|------|--------|----------|
| **UI view** | `UIController.getView()` | The React renderer — sidebar, omnibox, chat, tab bar, notifications, dialogs |
| **Tab view** | `TabController.getViewContainer()` | The active tab's web page content |

Only one tab view is visible at a time. On tab switch, the old tab is hidden (`setVisible(false)`) and the new tab is shown.

### How z-order works

Electron's `BaseWindow.contentView` renders child views in **insertion order** — the **last child added is topmost** and receives all mouse/pointer events in overlapping regions. There is no CSS `z-index`; the order is controlled programmatically.

The method `updateZOrder()` enforces the current desired layering by re-adding the "winner" view as the last child:

```
isWebContentInteractive === true  → tab view on top  → web page is mouse-interactive
isWebContentInteractive === false → UI view on top   → UI receives all mouse events
```

### Platform difference (Windows vs. macOS/Linux)

- **macOS/Linux:** Re-adding the topmost view via `addChildView()` is sufficient. Electron handles the rest.
- **Windows:** Due to a Win32 hit-testing bug, all child views must be **explicitly removed and re-added** in the correct order. Simply re-adding one view doesn't reliably update the hit-test regions. See `updateZOrder()` for the platform-branched implementation.

**File:** `index.ts` → `updateZOrder()`

---

## 2. Two Independent Concerns

Focus handling has **two orthogonal axes** that must not be conflated:

### 2a. Z-order (mouse interactivity)

Controlled by `handleMovePanelToForeground(panel)`.

- Sets `isWebContentInteractive` and calls `updateZOrder()`.
- Determines which view sits on top and captures mouse/pointer events in the overlapping region (the web content area).
- The UI view always covers the full window; the tab view is positioned within the content area. Overlap exists only in the content area.

**Karton RPC:** `browser.layout.movePanelToForeground`

### 2b. Keyboard focus

Controlled by `handleTogglePanelKeyboardFocus(panel)`.

- Calls `.focus()` on either `UIController` or `TabController`, which forwards to `webContents.focus()`.
- Does **not** change z-order on macOS/Linux.
- **Windows only:** Must set `isWebContentInteractive = false` and call `updateZOrder()` **before** calling `uiController.focus()`, otherwise the tab's Win32 child window intercepts keyboard events even when UI focus is requested. This is scoped to `panel === 'stagewise-ui'` only.

**Karton RPC:** `browser.layout.togglePanelKeyboardFocus`

### Why both exist

A user hovering over the web content area needs the tab view on top for mouse interaction. But when the omnibox opens (triggered by keyboard shortcut), keyboard focus must move to the UI **without** changing z-order (on macOS/Linux) — otherwise the omnibox popup would be hidden behind the tab view. The separation allows mouse interactivity and keyboard focus to be managed independently.

---

## 3. All Z-Order Change Triggers

Every code path that can change `isWebContentInteractive` or call `updateZOrder()`:

### 3a. Via `handleMovePanelToForeground` (Karton RPC)

| Caller | Location | Fires with | Trigger condition |
|--------|----------|------------|-------------------|
| **WebContentsBoundsSyncer** | `ui/components/web-contents-bounds-syncer.tsx` | `'tab-content'` or `'stagewise-ui'` | `mousemove` → `elementFromPoint` detects hover entering/leaving the tab preview container |
| **HoveredElementTracker** | `web-content-preload/components/hovered-element-tracker.tsx` | `'tab-content'` | Mouse enters an element overlay (selected/hovered element highlight) in the preload |
| **NotificationToaster** | `ui/notification-toaster.tsx` | `'stagewise-ui'` | New notification appears (never fires `'tab-content'`) |
| **BasicAuthDialog** | `ui/screens/main/content/_components/basic-auth-dialog.tsx` | `'stagewise-ui'` | Dialog mounts (never fires `'tab-content'`) |
| **Omnibox** | `ui/screens/main/content/_components/omnibox/index.tsx` | `'stagewise-ui'` on open only | Omnibox open state change. On close, z-order is **not** explicitly switched — `WebContentsBoundsSyncer` handles restoring `'tab-content'` via hover detection. See bug 9.8. |

### 3b. Direct `isWebContentInteractive` writes (bypass the handler)

| Location | Sets to | When |
|----------|---------|------|
| `handleContentFullscreenChanged` | `true` | Tab enters HTML5 content fullscreen |
| `handleSwitchTab` | `true` | Switching to a tab that is in content fullscreen |
| `handleSwitchTab` | `false` | Switching to a normal tab (both `currentWebContentBounds` present and absent paths) |
| `handleTogglePanelKeyboardFocus` | `false` | Windows-only: before focusing the UI view |

### 3c. `updateZOrder()` calls without `isWebContentInteractive` change

| Location | When |
|----------|------|
| `createTab` | After adding the new tab's view to `contentView` — reinforces current z-order so the new view doesn't accidentally sit on top |
| `setupUIViewRecreatedListener` | After the UI view is recreated (e.g., DevTools toggle) — restores correct layering |

---

## 4. The `tabFocused` Event Chain

This is a **separate concern from z-order**. It tracks which panel last had keyboard focus per tab, so that switching back to a tab can restore the correct focus target.

```
wc.on('focus')                           // Electron: webcontents gained focus
  → TabController.emit('tabFocused')     // Backend event
  → UIController.forwardFocusEvent(id)   // IPC: send to UI renderer
  → ipcRenderer → CustomEvent           // ui-preload/index.ts
  → window 'stagewise-tab-focused'       // DOM event in UI
  → handleTabFocused (content/index.tsx) // Sets tabUiState[tabId].focusedPanel = 'tab-content'
```

The reverse (`window 'focus'` event in the UI renderer) sets `focusedPanel = 'stagewise-ui'`.

**Consumer:** `Tab.handleClick()` in `tab.tsx` reads `tabUiState[tabId]?.focusedPanel ?? 'stagewise-ui'` and calls `togglePanelKeyboardFocus(focus)` after switching to that tab. This means: if you were focused on the web content when you left a tab, switching back restores keyboard focus to the web content.

---

## 5. Startup Sequence

Understanding startup is critical because many z-order bugs have been race conditions during initialization.

```
1. WindowLayoutService constructor
   └─ BaseWindow created
   └─ uiController view added to contentView (only child at this point)
   └─ isWebContentInteractive = false (class field default)

2. createTab(initialUrl, true)
   └─ TabController created
   └─ tab.setVisible(false)
   └─ tab view added to contentView
   └─ updateZOrder() — UI stays on top (isWebContentInteractive = false)
   └─ handleSwitchTab(tabId)
       └─ currentWebContentBounds is null → tab stays invisible
       └─ isWebContentInteractive = false (explicit)
       └─ updateZOrder()

3. UI React app mounts and renders
   └─ WebContentsBoundsSyncer starts RAF loop
   └─ ResizeObserver fires → sends first layoutUpdate(bounds)

4. handleLayoutUpdate(bounds)
   └─ currentWebContentBounds = bounds (no longer null)
   └─ activeTab.setVisible(true)
   └─ activeTab.setBounds(bounds)
   └─ (z-order is NOT changed here — stays as-is)

5. handleUIReady
   └─ baseWindow.show() — window becomes visible to the user
   └─ Initial window state applied (maximize, fullscreen)

6. WebContentsBoundsSyncer hover detection kicks in
   └─ First movePanelToForeground call based on actual mouse position
```

### Startup guard

`handleMovePanelToForeground` contains a guard:

```ts
if (panel === 'tab-content' && this.currentWebContentBounds === null) return;
```

This prevents `'tab-content'` requests from being honored before the UI has sent its first `layoutUpdate`. Without this guard, the initial `wc.on('focus')` event (which fires when Electron loads the webcontents) would push the tab view on top before the UI is ready, hiding any UI elements rendered over the content area.

---

## 6. The `WebContentsBoundsSyncer` in Detail

This is the **primary continuous driver** of z-order during normal usage. All other callers are event-driven (one-shot).

**File:** `ui/components/web-contents-bounds-syncer.tsx`

It runs inside the UI renderer as a React component that renders nothing (`return null`). It manages two concerns in a single `useLayoutEffect`:

### 6a. Bounds synchronization

- Finds the tab preview container DOM element (`#dev-app-preview-container-{tabId}`)
- Uses `ResizeObserver` to track size changes
- Fires `layoutUpdate(bounds)` via Karton RPC (fire-and-forget) whenever the container's `getBoundingClientRect()` changes
- Fires `layoutUpdate(null)` when the container disappears or has zero opacity (< 0.5)

### 6b. Hover-based z-order switching

- Tracks mouse position via `mousemove` listener
- On each mouse move, calls `elementFromPoint(x, y)` and checks if the element under the cursor is inside a `[id^="dev-app-preview-container-"]`
- If hovering → `movePanelToForeground('tab-content')` (tab becomes mouse-interactive)
- If not hovering → `movePanelToForeground('stagewise-ui')` (UI becomes mouse-interactive)
- **Exclusions:** Does NOT switch to `'tab-content'` if any of these are active:
  - Element selector overlay (`[data-element-selector-overlay]`)
  - Omnibox modal (`[data-omnibox-modal-active]`)
  - Notification toast (`[data-notification-toast-active]`)
- State resets (`lastBounds`, `lastInteractive`) on `activeTabId` change

---

## 7. Content Fullscreen

HTML5 fullscreen (e.g., a video going fullscreen within a page) is handled separately:

- `handleContentFullscreenChanged(tabId, true)`:
  - Sets tab bounds to full window size
  - Sets `isWebContentInteractive = true` directly (bypasses handler)
  - Removes border radius
- `handleContentFullscreenChanged(tabId, false)`:
  - Restores tab bounds to `currentWebContentBounds`
  - Does **not** reset `isWebContentInteractive` — leaves it `true` because the mouse is likely still over the content area. Normal hover detection will switch z-order when the mouse moves.
- Only one tab can be in content fullscreen at a time (`contentFullscreenTabId` tracks which)

---

## 8. Tab Switch Flow

When `handleSwitchTab(tabId)` is called:

1. If the previous tab was in content fullscreen, exit it
2. Set `activeTabId = tabId`
3. Show the new tab:
   - If the new tab is in content fullscreen → full window bounds, `isWebContentInteractive = true`
   - If `currentWebContentBounds` exists → apply bounds, `isWebContentInteractive = false`
   - If no bounds yet → keep invisible, `isWebContentInteractive = false`
4. Hide the previous tab
5. Call `updateZOrder()`

**Key invariant:** `handleSwitchTab` always resets `isWebContentInteractive = false` for non-fullscreen tabs. The `WebContentsBoundsSyncer` will then re-evaluate hover state on the next mouse move and set the correct z-order.

---

## 9. Bug History

Chronological record of z-order/focus bugs and their fixes. Read these to understand why specific guards and platform checks exist — removing any of them risks regression.

### 9.1 `a9716d30` — Web contents focus on tab change and window focus

- **Symptom:** After switching tabs or re-focusing the window, web contents didn't reliably receive focus.
- **Root cause:** Hover detection used `mouseenter` events which didn't fire reliably on tab/window focus changes.
- **Fix:** Replaced `mouseenter`/`focusin` based hover tracking with `mousemove` + `elementFromPoint()`. The `elementFromPoint` approach respects actual z-order and works regardless of how focus changed.

### 9.2 `52882e1e` — stagewise-ui not interactive when omnibox is open

- **Symptom:** With omnibox open, the UI behind it was not mouse-interactive (couldn't click omnibox suggestions).
- **Root cause:** `WebContentsBoundsSyncer` was switching to `'tab-content'` while the omnibox was open because it didn't know the omnibox was covering the content area.
- **Fix:** Added `[data-omnibox-modal-active]` and `[data-notification-toast-active]` exclusion checks to the hover detection logic in `WebContentsBoundsSyncer`.

### 9.3 `e1909e5e` — Omnibox focus broken after webcontents focus

- **Symptom:** After clicking in web content and then pressing the omnibox hotkey, the omnibox didn't receive focus.
- **Root cause:** `isWebContentInteractive` was initialized to `true`, and the startup sequence left the tab view on top. When the omnibox tried to open, the UI view was behind the tab view and couldn't receive keyboard events.
- **Fix:** Changed `isWebContentInteractive` default from `true` to `false`. Added explicit `isWebContentInteractive = false` in the no-bounds branch of `handleSwitchTab`. Added z-order update in `handleTogglePanelKeyboardFocus` for `'stagewise-ui'`.

### 9.4 `a664b1fa` — Omnibox z-order issue with webcontents

- **Symptom:** On macOS/Linux, toggling keyboard focus to the UI also changed z-order, causing the web content to lose mouse interactivity unnecessarily.
- **Root cause:** `handleTogglePanelKeyboardFocus('stagewise-ui')` was setting `isWebContentInteractive = false` and calling `updateZOrder()` on all platforms, even though only keyboard focus was requested.
- **Fix:** Removed the z-order change from `handleTogglePanelKeyboardFocus` — keyboard focus and z-order are independent on macOS/Linux. (Later partially re-added for Windows only in `24e8909d`.)

### 9.5 `24e8909d` — Restore win32 z-order update before UI focus

- **Symptom:** On Windows, after clicking in web content, pressing the omnibox hotkey didn't give focus to the omnibox.
- **Root cause:** On Windows, `webContents.focus()` doesn't work if the target view's Win32 child window is not the topmost one — the tab view's window intercepts all input.
- **Fix:** Re-added `isWebContentInteractive = false` + `updateZOrder()` in `handleTogglePanelKeyboardFocus` for `panel === 'stagewise-ui'`, but **scoped to `process.platform === 'win32'` only**. macOS/Linux don't need it.

### 9.6 `acb1325e` — UI foreground when notifications are active

- **Symptom:** Notification toasts rendered behind the web content view and were invisible/unclickable.
- **Root cause:** No code was switching z-order when notifications appeared.
- **Fix:** `NotificationToaster` now calls `movePanelToForeground('stagewise-ui')` when new notifications arrive.

### 9.7 Startup `tab-content` guard (current)

- **Symptom:** On startup, UI elements (permission dialogs, notifications) rendered behind the web content view.
- **Root cause:** When Electron loads the first tab's webcontents, `wc.on('focus')` fires automatically. This triggers `tabFocused` → `handleTabFocused` → sets `focusedPanel: 'tab-content'`. The `WebContentsBoundsSyncer` or other callers would then call `movePanelToForeground('tab-content')` before the UI had sent its first `layoutUpdate`, pushing the tab view on top prematurely.
- **Fix:** Added a guard in `handleMovePanelToForeground`: if `panel === 'tab-content'` and `currentWebContentBounds === null`, the request is silently ignored. This is semantically correct — if no bounds exist, the tab view isn't positioned or visible, so making it interactive is meaningless.

### 9.8 Omnibox navigation switches to `tab-content` prematurely

- **Symptom:** After navigating from the omnibox (Enter on a URL/suggestion), the web content view immediately jumped to the foreground, hiding any UI overlays. The URL bar appeared unresponsive until the mouse moved.
- **Root cause:** The omnibox's combobox/popover component closes itself (`isOmniboxOpen = false`) on Enter **before** the `onSubmit` handler runs. The z-order `useEffect` observed the close, saw `didNavigateRef.current === false` (not yet set by `onSubmit`), and eagerly called `movePanelToForeground('tab-content')`. By the time `onSubmit` set `didNavigateRef.current = true`, the damage was done.
- **Fix:** Removed the `'tab-content'` call from the omnibox close effect entirely. The omnibox now **only** fires `movePanelToForeground('stagewise-ui')` on open. On close, `WebContentsBoundsSyncer` handles restoring `'tab-content'` naturally via hover detection + `data-omnibox-modal-active` (which stays set via `navigationPending` during page load). This eliminates the race and aligns with invariant 6 — the syncer is the sole continuous z-order driver.

### 9.9 Win32: Redundant `updateZOrder()` destroys native HWND keyboard focus

- **Symptom:** On Windows, clicking the omnibox or pressing Ctrl+L appeared to give DOM focus (`document.activeElement === INPUT`), but the cursor didn't appear and keyboard input was silently dropped. The omnibox was completely non-functional.
- **Root cause:** `handleMovePanelToForeground` had no short-circuit — it always called `updateZOrder()` even when `isWebContentInteractive` was already in the desired state. On Win32, `updateZOrder()` must `removeChildView`/`addChildView` all views to work around a hit-testing bug, and this remove/add cycle **destroys native HWND keyboard focus** every time it runs. The `WebContentsBoundsSyncer` fires `movePanelToForeground('stagewise-ui')` on every `mousemove` while the cursor is over the UI area (~every 100-200ms). Each redundant call triggered the destructive remove/add dance, immediately killing whatever native focus the omnibox had just acquired. The DOM layer (`document.activeElement`) was unaware of the native focus loss, creating a confusing disconnect between what the code reported and what the user experienced.
- **Fix (three parts):**
  1. **Short-circuit in `handleMovePanelToForeground`:** If `isWebContentInteractive` already equals the target value, return immediately without calling `updateZOrder()`. This is the primary fix — it eliminates the continuous focus destruction from `WebContentsBoundsSyncer` on mouse move.
  2. **Focus restore in `updateZOrder()` Win32 path:** After the remove/add dance, check which view had native focus before and restore it (via `webContents.focus()`) if that view is the one ending up topmost. This preserves focus during *legitimate* z-order transitions.
  3. **Win32 z-order in `handleTogglePanelKeyboardFocus`:** When `panel === 'stagewise-ui'` and `isWebContentInteractive` is `true` on Win32, set `isWebContentInteractive = false` and call `updateZOrder()` *before* `uiController.focus()`. This was documented in Invariant 3 and Bug 9.5 but had been lost during a code reset.
- **Key insight:** On Win32, `removeChildView`/`addChildView` is not idempotent for keyboard focus. The operation is cheap for z-order but destructive for focus. Any call to `updateZOrder()` must be guarded against redundancy.

### 9.10 Search bar leaves web contents non-interactive

- **Symptom:** After pressing CMD+F to open the search bar, web content lost mouse interactivity. Clicking into the web content or pressing ESC to close the search bar didn't restore it. The user had to move the mouse off the content area and back.
- **Root cause:** `handleTogglePanelKeyboardFocus('stagewise-ui')` was missing the `process.platform === 'win32'` guard — it changed `isWebContentInteractive` to `false` and called `updateZOrder()` on **all** platforms. On macOS/Linux, this violates Invariant #2 (z-order and keyboard focus are independent). The `WebContentsBoundsSyncer`'s local `lastInteractive` cache remained `true` (stale), and on the next `mousemove` over content the syncer saw `isHovering = true` matching its stale `lastInteractive = true`, skipping the `movePanelToForeground('tab-content')` call.
- **Fix (two parts):**
  1. **Restored `process.platform === 'win32'` guard** on the `'stagewise-ui'` path in `handleTogglePanelKeyboardFocus`. This is the primary fix — on macOS/Linux, z-order no longer changes when keyboard focus moves to the UI, so the syncer cache stays consistent.
  2. **Added `handleMovePanelToForeground('tab-content')` in `handleDeactivateSearchBar`** as a safety net for Win32, where the z-order change is required. This explicitly restores web content z-order when the search bar closes. The existing short-circuit and startup guard in `handleMovePanelToForeground` make this safe and no-op on macOS/Linux.

---

## 10. Invariants

Rules that must always hold. Violating any of these will cause regressions:

1. **`isWebContentInteractive` must be `false` until the UI has sent its first `layoutUpdate`** (i.e., `currentWebContentBounds !== null`). The startup guard in `handleMovePanelToForeground` enforces this.

2. **Z-order and keyboard focus are independent on macOS/Linux.** Do not change `isWebContentInteractive` or call `updateZOrder()` inside `handleTogglePanelKeyboardFocus` on non-Windows platforms.

3. **On Windows, z-order must be updated before `uiController.focus()`** when switching keyboard focus to the UI. The Win32 child window model requires the target view to be topmost.

4. **`handleSwitchTab` always resets `isWebContentInteractive = false`** for non-fullscreen tabs. The continuous hover detection (`WebContentsBoundsSyncer`) then takes over.

5. **Content fullscreen bypasses `handleMovePanelToForeground`** and sets `isWebContentInteractive = true` directly. On fullscreen exit, it does NOT reset to `false` — hover detection handles the transition.

6. **The `WebContentsBoundsSyncer` is the only continuous z-order driver.** All other callers are event-driven. If the syncer is broken or not running, z-order will not update during normal mouse interaction.

7. **UI-forcing callers (`NotificationToaster`, `BasicAuthDialog`) only ever fire `'stagewise-ui'`** — they never fire `'tab-content'`. This ensures overlays are always visible.

8. **The omnibox only fires `'stagewise-ui'` (on open) — never `'tab-content'`.** On close, `WebContentsBoundsSyncer` restores `'tab-content'` naturally via hover detection. This avoids race conditions between the popover closing and submit handlers running (see bug 9.8).

9. **`handleMovePanelToForeground` must short-circuit when `isWebContentInteractive` already matches the target value.** On Win32, every `updateZOrder()` call destroys native HWND keyboard focus via the `removeChildView`/`addChildView` dance. The `WebContentsBoundsSyncer` fires `movePanelToForeground` on every mouse move, so without the short-circuit, any UI element with focus will lose it within ~100-200ms. See bug 9.9.
