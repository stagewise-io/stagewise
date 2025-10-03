# @stagewise-agent/client-sdk

## 0.6.0

### Minor Changes

- c0c92f5: Add reasoning capabilities to the agent.

## 0.5.1

### Patch Changes

- ab359b9: Update plan-limit error to reflect input + output tokens.

## 0.5.0

### Minor Changes

- 737b059: Adding handlers for plan limit reached errors.

## 0.4.0

### Minor Changes

- add73d9: Move agent and prompting logic completely clientside.

## 0.3.3

### Patch Changes

- 2f23d4b: Refactor crypto import to fix node v18 issues.

## 0.3.2

### Patch Changes

- 650fbb7: Add undo button below assistant messages as well.

## 0.3.1

### Patch Changes

- f5a806d: Fixing tool-call aborts mid execution!

## 0.3.0

### Minor Changes

- 8026be4: Added file diff information to tool results.

## 0.2.0

### Minor Changes

- 299e75a: Implement undo functionality - it is now possible to restore a checkpoint and revert all file modifications to this point.

## 0.1.4

### Patch Changes

- be1f43a: Fix reauthentication on expired tokens.

## 0.1.3

### Patch Changes

- 1f89825: Fix 'fetch failed' error on agent messages.

## 0.1.2

### Patch Changes

- 598ff77: Make the "missing credits" notification more user friendly.
- 5c0eb1a: Fix auth token refresh in the chat.

## 0.1.1

### Patch Changes

- d758c0f: Fix cli throws on insufficient credits.

## 0.1.0

### Minor Changes

- 02140ae: Adding chat history and migrating to UI messages.

## 0.0.3

### Patch Changes

- 5536a04: Migrate build scripts to typescript.

## 0.0.2

### Patch Changes

- 44a659c: Remove tool-call logs.

## 0.0.1

### Patch Changes

- ba78283: Add user-friendly error messages and log credit usage.

## 0.0.9

### Patch Changes

- 8b6be17: Adding finishReason logs to LLM calls and increasing max tokens

## 0.0.8

### Patch Changes

- 2374189: Add logging to failed api requests.

## 0.0.7

### Patch Changes

- 0aa12fb: Add agent state description validation.

## 0.0.6

### Patch Changes

- 646b5c8: Allow synthetic tool calls before LLM-usage.
- de6826b: Improve error logging and state messages.

## 0.0.5

### Patch Changes

- 85d33e4: Adding access-token refreshs on agent requests to api.stagewise.io

## 0.0.4

### Patch Changes

- 55069a3: Improving the robustness of the agent-sdk.

## 0.0.3

### Patch Changes

- 2f05c00: Adding dynamic description to agent-client-sdk

## 0.0.2

### Patch Changes

- b7ce742: Adding event handlers to the client sdk.
