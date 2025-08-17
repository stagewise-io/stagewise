# stagewise-vscode-extension

## 0.11.0

### Minor Changes

- be87c2c: Remove support for old and deprecated toolbar versions

## 0.10.6

### Patch Changes

- Updated dependencies [598ff77]
- Updated dependencies [5c0eb1a]
  - @stagewise/agent-client@0.1.2

## 0.10.5

### Patch Changes

- Updated dependencies [d758c0f]
  - @stagewise/agent-client@0.1.1

## 0.10.4

### Patch Changes

- Updated dependencies [02140ae]
- Updated dependencies [02140ae]
  - @stagewise/agent-interface@0.3.1
  - @stagewise/agent-client@0.1.0
  - @stagewise/agent-runtime-vscode@0.0.2

## 0.10.3

### Patch Changes

- Updated dependencies [6e4c218]
  - @stagewise/agent-interface@0.3.0

## 0.10.2

### Patch Changes

- 1a8085e: Update npx stagewise docs to use stagewise@latest.
- Updated dependencies [5536a04]
  - @stagewise/agent-runtime-vscode@0.0.2
  - @stagewise/agent-client@0.0.3

## 0.10.1

### Patch Changes

- Updated dependencies [44a659c]
  - @stagewise/agent-client@0.0.2

## 0.10.0

### Minor Changes

- f0075e5: Show an upgrade information panel to the user if they use old toolbar versions

## 0.9.1

### Patch Changes

- c34bdc3: Remove early access checks.

## 0.9.0

### Minor Changes

- 3bead9e: Only start one agent per window at once. Automatically select the best option.

## 0.8.18

### Patch Changes

- 0d26c54: Update agent-client-sdk to show better agent failed states.

## 0.8.17

### Patch Changes

- ebe1d5f: Adapt the authentication URL in the extension.

## 0.8.16

### Patch Changes

- e1d4c96: Updating the new auto-setup-prompt.

## 0.8.15

### Patch Changes

- 14a1790: Add plain-js instructions to the setup-toolbar prompt.
- 9986196: Clarifying early access commands.

## 0.8.14

### Patch Changes

- 29c2d1e: Updating dependencies.
- 5cb6c8f: Updating client-sdk to log request errors
- Updated dependencies [29c2d1e]
  - @stagewise/agent-interface@0.2.3

## 0.8.13

### Patch Changes

- c9a7535: Updating agent-client-sdk with agent-state description validation fix

## 0.8.12

### Patch Changes

- cb9c248: Improving token-refresh robustness
- b5d75e7: Adding enhanced error logging to the custom agent.

## 0.8.11

### Patch Changes

- aff8a76: Improve API connectivity (changed env vars for build)

## 0.8.10

### Patch Changes

- 3e1b802: Updating agent-client-sdk dependency.

## 0.8.9

### Patch Changes

- 4d872c9: Fix spelling of stagewise.

## 0.8.8

### Patch Changes

- 210f7f0: Add the custom stagewise agent to the extension.

## 0.8.7

### Patch Changes

- a2a9518: Adding authentication to the vscode extension.
- f71e818: Fixing vscode types version (reverting to 1.85.0)

## 0.8.6

### Patch Changes

- 47c3827: Make sure that the toolbar recognizes the retro agent service as available
- Updated dependencies [69d29b2]
  - @stagewise/agent-interface@0.2.2

## 0.8.5

### Patch Changes

- 7a10613: Updated dependencies.
- Updated dependencies [7a10613]
  - @stagewise/extension-toolbar-srpc-contract@0.2.1
  - @stagewise/agent-interface@0.2.1

## 0.8.4

### Patch Changes

- Updated dependencies [6d3e1c7]
  - @stagewise/agent-interface@0.2.0

## 0.8.3

### Patch Changes

- Updated dependencies [b328294]
  - @stagewise/agent-interface@0.1.3

## 0.8.2

### Patch Changes

- Updated dependencies [787e8e1]
  - @stagewise/agent-interface@0.1.2

## 0.8.1

### Patch Changes

- Updated dependencies [a83ce44]
  - @stagewise/agent-interface@0.1.1

## 0.8.0

### Minor Changes

- 32ef6f5: Added support for the new agent interface

### Patch Changes

- Updated dependencies [32ef6f5]
  - @stagewise/agent-interface@0.1.0

## 0.7.2

### Patch Changes

- 1a6b8d6: Make sure that services are properly initialized before use
- Updated dependencies [e4a0864]
  - @stagewise/extension-toolbar-srpc-contract@0.2.0

## 0.7.1

### Patch Changes

- abd370c: Including email after capturing feedback.

## 0.7.0

### Minor Changes

- 470d0e9: Add support for the Kilo Code AI Agent VS Code extension

## 0.6.1

### Patch Changes

- 6e80d88: Noop-change: Triggering the release of trae-support.

## 0.6.0

### Minor Changes

- e96488d: Support Trae IDE

## 0.5.2

### Patch Changes

- e147977: Give users improved situational recommendations for actions
- d0db97c: Fix service architecture in codebase to prevent race-conditions etc.
- a8d2b4b: Add stagewise integration recommendation for new web projects

## 0.5.1

### Minor Changes

- a1e0027: Add update recommendations for outdated toolbar packages

## 0.5.1

### Patch Changes

- 263c871: Add roo-code and cline support
- 2e121ac: Updated the README to clarify how framework-specific packages are named
- 1b6e4a2: Fix package dependency parser in order to report correct toolbar version
- Updated dependencies [2e121ac]
  - @stagewise/extension-toolbar-srpc-contract@0.1.3

## 0.5.0

### Minor Changes

- 49f75c9: Add a getting started onboarding flow

### Patch Changes

- 02bd300: Adding a window-select-hint when multiple windows are selected
- d0fca4b: Add information about extension and toolbar version to telemetry
- Updated dependencies [02bd300]
  - @stagewise/extension-toolbar-srpc-contract@0.1.2

## 0.4.4

### Patch Changes

- d3a6569: Refactor application structure
- 0c81ec9: Improved toolbar setup prompt
- bef562d: Changed branding slogan
  - @stagewise/extension-toolbar-srpc-contract@0.1.1

## 0.4.3

### Patch Changes

- 8f6f8ec: Implement GitHub Copilot support

## 0.4.2

### Patch Changes

- 56e2bea: Don't crash when analytics can't be configured
- 3d8613e: Update the README agent list

## 0.4.1

### Patch Changes

- c9cafe7: Include pseudonymized telemetry collection

## 0.4.0

### Minor Changes

- bde4944: Add images, files, mode and model properties to the srpc contract and agent call dispatches
- f4b085d: Add session management and connection state

### Patch Changes

- 0092794: Update license and copyright notices
- 3b637e8: Update README.md to include multiple-window-caveat
- 1575df4: Renaming variables to improve clarity.
- 79e11fa: Align versions to match 0.3
- 92407bd: Update license field in readme.
- Updated dependencies [bde4944]
- Updated dependencies [79e11fa]
- Updated dependencies [0092794]
- Updated dependencies [f4b085d]
- Updated dependencies [1575df4]
- Updated dependencies [058d70b]
- Updated dependencies [79e11fa]
  - @stagewise/extension-toolbar-srpc-contract@0.1.0

## 0.4.0-alpha.2

### Minor Changes

- f4b085d: Add session management and connection state

### Patch Changes

- Updated dependencies [f4b085d]
  - @stagewise/extension-toolbar-srpc-contract@0.1.0-alpha.1

## 0.3.1-alpha.1

### Patch Changes

- 92407bd: Update license field in readme.

## 0.3.1-alpha.0

### Patch Changes

- 3b637e8: Update README.md to include multiple-window-caveat

## 0.3.0-alpha.0

### Minor Changes

- bde4944: Add images, files, mode and model properties to the srpc contract and agent call dispatches

### Patch Changes

- 1575df4: Renaming variables to improve clarity.
- 79e11fa: Align versions to match 0.3
- Updated dependencies [bde4944]
- Updated dependencies [79e11fa]
- Updated dependencies [1575df4]
- Updated dependencies [058d70b]
- Updated dependencies [79e11fa]
  - @stagewise/extension-toolbar-srpc-contract@0.1.0-alpha.0

## 0.2.2

### Patch Changes

- 4337bd6: Remove mcp.json update, since mcp tools are not supported yet

## 0.2.1

### Patch Changes

- b74c54f: Improving the toolbar auto-setup prompt

## 0.2.0

### Minor Changes

- 278ae2a: Implement support for the windsurf IDE.
