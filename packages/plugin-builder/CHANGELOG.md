# @stagewise/plugin-builder

## 0.6.0

### Minor Changes

- 20d6671: Refactor the toolbar to new UI and new agent interface
- 20d6671: Update plugin API to new interface

### Patch Changes

- Updated dependencies [2c7432e]
- Updated dependencies [20d6671]
  - @stagewise/toolbar@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [17f1c51]
  - @stagewise/toolbar@0.5.2

## 0.5.1

### Patch Changes

- 7a10613: Updated dependencies.
- Updated dependencies [7a10613]
  - @stagewise/toolbar@0.5.1

## 0.5.0

### Patch Changes

- e4a0864: Revamp toolbar loading mechanism to use iframes

  - Plugins must now be default exported
  - Plugins must use the @stagewise/plugin-builder package to build their plugin
  - Deployed plugins are now default exports. Make sure to update your project accordingly.

- Updated dependencies [e4a0864]
  - @stagewise/toolbar@0.5.0
