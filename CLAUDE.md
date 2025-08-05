# General information

- This is a monorepo consisting of multiple projects

# Coding guidelines

- Always write compact code
- Don't do premature optimization
- Only implement what you're being told to do
- Don't impact existing functionality unless explicitly being told to do so
- Focus on your final goal instead of optimizing other parts of the app
- NEVER use any. NEVER use unknown unless absolutely necessary.

# Workflow

- Don't run tests or dev scripts from the root. Call scripts from individual project directories.
- Always use pnpm as package manager and for script execution
- Make commits when arriving at solid intermediary steps
- When receiving a instruction in the form of a reference to a file in the `claude-instructions` folder, apply the following strategy:
  - Completely understand and parse the instructions
  - Create a new file called `{NAME_OF_INSTRUCTION_FILE}.progress.md`
    - Use this file heavily to document your current progress in relation to the input file
    - Use this file to understand where you can pick up work instead of re-doing it.
  - If there are ambiguous or contradicting points in the instruction file, ALWAYS ask the user for feedback instead of making assumptions and simply continuing.

# Projects

- CLI
  - Package name: `stagewise`
  - Path: `apps/cli`
  - Purpose: Hosts the toolbar and the user's dev app on a single output port. Also hosts the stagewise agent.

- Agent
  - Package name: `@stagewise/agent-client``
  - Path: `agent/client`
  - Purpose: Implements the client/CLI-hosted parts of the stagewise agent. Interconnects with both the toolbar via Agent Interface as well as with the backend service via the `@stagewise/api-client` package.

- Toolbar
  - Package name: `@stagewise/toolbar`
  - Path: `toolbar/core`
  - Purpose: React app that offers the User Interface that get's rendered on top of the user's dev app

- Agent Interface
  - Package name: `@stagewise/agent-interface`
  - Path: `packages/agent-interface`
  - Purpose: Definition and base functionality for the interface between Toolbar and Agents (like the stagewise agent client).
