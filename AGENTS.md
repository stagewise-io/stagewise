# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Essential Commands

### Development
- `pnpm install` - Install dependencies (Node >= 22.12.0, pnpm 10.30.3 required)
- `pnpm dev` - Start workspace development tasks in Turbo watch mode

### Building
- `pnpm build` - Run all configured workspace build tasks
- `pnpm build:apps` - Build applications only (`apps/*`)
- `pnpm build:packages` - Build packages only (`packages/*`)

### Code Quality
- `pnpm check` - Run Biome linting/formatting checks (read-only)
- `pnpm check:fix` - Auto-fix linting/formatting issues across the repository
- `pnpm typecheck` - Run configured workspace `typecheck` tasks
- `pnpm -F @stagewise/agent-runtime-node type-check` - Typecheck the Node agent runtime (its script name differs)

### Testing
- `pnpm test` - Run configured workspace test tasks via Vitest
- `pnpm -F <package-name> test` - Run tests for a specific package (e.g., `pnpm -F @stagewise/karton test`)

### Browser App Specific
- `pnpm -F stagewise start` - Start the Electron browser app with typechecking
- `pnpm -F stagewise start:fast` - Start the Electron browser app without the initial typecheck
- `pnpm -F stagewise start:isolated` - Start with an isolated development profile
- `pnpm -F stagewise storybook` - Start Storybook for browser UI components
- `pnpm -F stagewise typecheck` - Typecheck browser UI, backend, web-content preload, and Storybook code
- `pnpm --dir apps/browser exec tsc -p tsconfig.pages.json --noEmit` - Typecheck Chromium pages separately
- `pnpm -F stagewise test` - Run browser app tests

### Maintenance
- `pnpm clean` - Clean root node_modules
- `pnpm clean:workspaces` - Run configured workspace clean tasks
- `pnpm clean:browser-data-isolated` - Remove isolated browser development profiles only

## Architecture Overview

Stagewise is a pnpm workspace and Turborepo monorepo. The product is an open-source agentic IDE with a built-in coding agent. Its main Electron browser combines browsing, debugging, editing, and agent workflows.

### Directory Structure

```
apps/
  browser/        - Electron app and main product (package `stagewise`)
  stagewise-cli/  - Headless host for the extracted agent packages
  deprecated-cli/ - Legacy v0.12 CLI; do not extend for new agent work
  website/        - Public website (Next.js 16)
  update-server/  - Electron update server

packages/
  agent-core/     - Host-agnostic agent runtime, state, commands, and tools
  agent-shell/    - Reusable PTY and shell environment
  icons/          - Canonical shared icon package
  karton/         - Typed client/server state and procedure transport
  stage-ui/       - Shared React component library and design system
  tailwindcss-color-modifiers/ - Custom Tailwind CSS utilities
  typescript-config/ - Shared TypeScript configurations

agent/
  runtime-node/   - Node-specific filesystem, glob, grep, and watch runtime

.agents/skills/   - Repository workflows and domain-specific guidance
```

### Key Technologies
- **Runtime**: Node.js 22.12+
- **Package Manager**: pnpm 10.30.3 (always use pnpm, never npm/yarn)
- **Build**: Turborepo for task orchestration, Vite/esbuild for bundling
- **Language**: TypeScript (strict mode)
- **Linting/Formatting**: Biome 2 (NOT ESLint or Prettier)
- **Desktop**: Electron with Electron Forge
- **Frontend**: React 19, Tailwind CSS 4
- **Website**: Next.js 16
- **Testing**: Vitest

## Code Style

Enforced by Biome:
- 2-space indentation
- Single quotes for JS/TS strings
- Double quotes for JSX attributes
- Semicolons always
- 80 character line width
- Trailing commas

Naming conventions:
- camelCase for functions/variables
- PascalCase for components/classes
- kebab-case for directories/files

## Commit Guidelines

**Conventional Commits with mandatory scopes:**

```
<type>(<scope>): <description>
```

Types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`

Scopes use pnpm workspace package basenames without the `@stagewise/` prefix:
- `stagewise` - apps/browser
- `stagewise-cli` - apps/stagewise-cli or apps/deprecated-cli
- `website` - apps/website
- `update-server` - apps/update-server
- `agent-core` - packages/agent-core
- `agent-shell` - packages/agent-shell
- `agent-runtime-node` - agent/runtime-node
- `icons` - packages/icons
- `karton` - packages/karton
- `stage-ui` - packages/stage-ui
- `tailwindcss-color-modifiers` - packages/tailwindcss-color-modifiers
- `typescript-config` - packages/typescript-config
- `global` - root or cross-workspace changes

Examples:
```bash
feat(stagewise): add isolated profile selector
fix(agent-core): preserve mount state during retry
chore(global): update workspace tooling
```

Sub-scopes like `browser-ui` are NOT valid - use the parent package scope.

## Pre-commit Hooks

Lefthook runs on commit:
1. Biome formats staged supported files
2. `pnpm check` runs the repository Biome check
3. Browser typecheck runs if browser TypeScript files changed
4. Commitlint validates the commit message

## Workspace Dependencies

- Use `workspace:*` protocol for inter-package dependencies
- Add to root: `pnpm add <package> -w`
- Add to specific package: `pnpm add <package> --filter <package-name>`
- Do not edit `pnpm-lock.yaml` manually

## Browser App Architecture

The main Electron app (`apps/browser`) has multiple TypeScript configs:
- `tsconfig.ui.json` - React UI code
- `tsconfig.pages.json` - Chromium page renderer and routes
- `tsconfig.backend.json` - Electron main process
- `tsconfig.web-content-preload.json` - Web-content preload scripts
- `tsconfig.storybook.json` - Storybook configuration

Key dependencies include AI SDK provider integrations, TipTap, TanStack Router, Karton, Stage UI, and the extracted agent packages. Model routing is instance-aware: preserve the `(providerInstanceId, modelId)` pair and keep provider implementations under `apps/browser/src/backend/agents/providers`.

## Important Notes

1. **Biome is the linter/formatter** - NOT ESLint or Prettier
2. **Always run `pnpm check:fix` before committing**
3. **TypeScript strict mode** is enabled - handle all type errors
4. **Turbo caching** is enabled - build outputs are cached
5. **The browser app uses Electron Forge** for packaging and distribution
