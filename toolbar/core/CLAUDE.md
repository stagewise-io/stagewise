# General information

- Toolbar application
- Is served by CLI
- Loads the users dev app into an iframe (`user-app-iframe`)
- React application
- Codebase in TypeScript

# Workflow

- Make script calls always from within this package
- Make dev builds with `pnpm dev`
- Make prod build with `pnpm build`
- Make sure to build the `@stagewise/agent-interface` package before building this package during development
- After creating builds, they will be loaded by the CLI on it's next start
- Write tests for complex functionalities
  - Always put tests into a package root `test` folder
  - Always put tests into sub-folders that mirrors the `src` folder structure
  - Split tests for complex functionalities into individual files and put them into one common foloder names like the tested module
  - Use `vitest` as testing framework.
  - Use `vitest`, `jsdom` and `@testing-library/react-hooks` to test react hooks.
  - Always name tests `{MODULE_NAME_OR_FUNCTIONALITY}.test.ts`

# Functionalities

- Hosts a drag-and-drop movable toolbar
- Offers a chat/messaging window to talk with the connected agent
- Either uses the stagewise agent or searches for other agents on the localhost device (depending on how the toolbar got configured by the CLI)
- Can be extended with plugins

# Structure

- `src`: All sources for the toolbar
  - `components`: General components and functionality
    - `ui`: Reusable basic ui components
    - `dom-context-selector`: Components for the `Select elements as prompt context` functionality
  - `hooks`: Hooks for app state, config, etc.
    - `agent`: Hooks for agent connectivity. Manages both basic connectivity as well as individual capabilities.
      - Individual interface capabilities are covered by individual hooks.
  - `layouts`: Main UI layout definitions
  - `panels`: Content for panels that users can open up (chat, settings, agent connection settings etc.)
  - `plugin-sdk`: Definitions that will be exposed to plugins for further functionality
  - `toolbar`: Components that render the toolbar area itself. Buttons in the toolbar toggle opening/closing panels and more.
    - `contents`: Lists of buttons and icons that are rendered into the toolbar based on it's state (connected/not-connected etc.)
    - `components`: The underyling components used in the toolbar
