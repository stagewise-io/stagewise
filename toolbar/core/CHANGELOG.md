# @stagewise/toolbar

## 0.4.8

### Patch Changes

- 02b58d8: Fix type issues in plugin-sdk Button component
- 33be114: add legacy module resolution support for older bundlers

## 0.4.7

### Patch Changes

- 263c871: Update README.md to include roocode and cline support
- 2e121ac: Updated the README to clarify how framework-specific packages are named

## 0.4.6

### Patch Changes

- 02bd300: Adding a window-select-hint when multiple windows are selected

## 0.4.5

### Patch Changes

- bef562d: Changed branding slogan
- ff3a30e: Fix infinite loading state
- 6144c99: Support character composition in chat input box
- 9e7610d: Replace randomUUID calls with (unsafer, but universally working) Math.random generated IDs
- 1b47ca5: Reducing error logs in windows discovery

## 0.4.4

### Patch Changes

- 9b96cb5: Replace ua-parser-js with bowser

## 0.4.3

### Patch Changes

- 2ebfe5e: Update tailwind names

## 0.4.2

### Patch Changes

- e2cb10f: Render context element plugin badges only if content is returned

## 0.4.1

### Patch Changes

- 8f6f8ec: Update README.md to include GitHub Copilot
- f44c5f2: Update README (removing example-plugin)

## 0.4.0

### Minor Changes

- 3ab9b64: Add useConfig hook to access config properties throughout the toolbar. Adds an experimental object property to set feature flags for experimental feature usage

### Patch Changes

- aa11e20: Don't capture key events when hotkey don't result in any change

## 0.3.1

### Patch Changes

- 3d8613e: Update the README agent list

## 0.3.0

### Minor Changes

- bca204b: Add implementation for plugin api
- f4b085d: Add session management and connection state
- 0897284: Refactor plugin API
- 4abc02e: Add plugin-components and change toolbar design
- ce71a0d: Add element name to item proposals

### Patch Changes

- da84c16: Fix mouse pointer capturing outside of proper toolbar content
- 0092794: Update license and copyright notices
- 3b637e8: Update README.md to include multiple-window-caveat
- ddc9c9b: Remove all dependencies from toolbar/core
- e148009: Fix the height of the toolbar-chat.
- 16fe652: Fix bridge connection error when using context.sendPrompt in plugins
- 058d70b: Make extension-toolbar-srpc-contract tree-shakeable and restructure toolbar-plugin-architecture.
- 79e11fa: Align versions to match 0.3
- 92407bd: Update license field in readme.
- a5c1d5b: Add a react plugin
- 319e0e1: Added initial version of react plugin and streamlined UI for plugin annotations in context element selectors

## 0.3.0-alpha.6

### Minor Changes

- f4b085d: Add session management and connection state

## 0.3.0-alpha.5

### Patch Changes

- 92407bd: Update license field in readme.

## 0.3.0-alpha.4

### Patch Changes

- 3b637e8: Update README.md to include multiple-window-caveat
- a5c1d5b: Add a react plugin
- 319e0e1: Added initial version of react plugin and streamlined UI for plugin annotations in context element selectors

## 0.3.0-alpha.3

### Patch Changes

- da84c16: Fix mouse pointer capturing outside of proper toolbar content

## 0.3.0-alpha.2

### Patch Changes

- ddc9c9b: Remove all dependencies from toolbar/core

## 0.3.0-alpha.1

### Patch Changes

- e148009: Fix the height of the toolbar-chat.

## 0.3.0-alpha.0

### Minor Changes

- bca204b: Add implementation for plugin api
- 0897284: Refactor plugin API
- 4abc02e: Add plugin-components and change toolbar design
- ce71a0d: Add element name to item proposals

### Patch Changes

- 16fe652: Fix bridge connection error when using context.sendPrompt in plugins
- 058d70b: Make extension-toolbar-srpc-contract tree-shakeable and restructure toolbar-plugin-architecture.
- 79e11fa: Align versions to match 0.3

## 0.2.1

### Patch Changes

- 57ea87c: Fixing malformed inter.css URL

## 0.2.0

### Minor Changes

- 8537415: Add dragging functionality for the toolbar

## 0.1.0

### Patch Changes

- Make the toolbar config optional.
