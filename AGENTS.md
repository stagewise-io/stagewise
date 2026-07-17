# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Essential Commands

### Development
- `pnpm install` - Install dependencies (Node >= 18, pnpm 10.x required)
- `pnpm dev` - Start all packages in watch mode (Turbo watch across workspaces)
- `pnpm dev:examples` - Watch mode for example applications
- `pnpm dev:plugins` - Watch mode for plugin packages

### Building
- `pnpm build` - Build all packages and apps
- `pnpm build:apps` - Build applications only (`apps/*`)
- `pnpm build:packages` - Build packages only (`packages/*`)
- `pnpm build:toolbar` - Build toolbar packages (`toolbar/*`)
- `pnpm build:plugins` - Build plugin packages (`plugins/*`)

### Code Quality
- `pnpm check` - Run Biome linting/formatting checks (read-only)
- `pnpm check:fix` - Auto-fix linting/formatting issues
- `pnpm typecheck` - Run TypeScript type checking across monorepo

### Testing
- `pnpm test` - Run tests via Vitest across workspaces
- `pnpm -F <package-name> test` - Run tests for specific package (e.g., `pnpm -F @stagewise/karton test`)

### Browser App Specific
- `pnpm -F stagewise start` - Start the Electron browser app (with typecheck)
- `pnpm -F stagewise storybook` - Start Storybook for browser UI components
- `pnpm -F stagewise typecheck` - Typecheck browser app only

### Maintenance
- `pnpm clean` - Clean node_modules
- `pnpm clean:workspaces` - Clean build artifacts (dist, .next, etc.)

## Architecture Overview

Stagewise is a monorepo using pnpm workspaces and Turborepo. The product is a browser-based development tool that connects frontend UI to AI agents in code editors, allowing developers to select DOM elements and have AI agents implement changes.

### Directory Structure

```
apps/
  browser/       - Electron desktop app (main product "stagewise")
  cli/           - CLI tool for running stagewise
  website/       - Documentation site (Next.js 15 + Fumadocs)
  update-server/ - Auto-update server for Electron app

packages/
  karton/        - WebSocket-based RPC library for client/server communication
  stage-ui/      - Shared React component library with design system
  tailwindcss-color-modifiers/ - Custom Tailwind CSS plugin
  typescript-config/ - Shared TypeScript configurations

toolbar/
  core/          - Core toolbar functionality (framework-agnostic)
  bridged/       - Bridged toolbar implementation
  plugin-sdk/    - SDK for building toolbar plugins

plugins/
  react/         - React framework plugin
  vue/           - Vue framework plugin
  angular/       - Angular framework plugin

agent/
  runtime-node/     - Node.js agent runtime implementation

examples/        - Framework integration examples (Next.js, Vue, Angular, etc.)
```

### Key Technologies
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm 10.x (always use pnpm, never npm/yarn)
- **Build**: Turborepo for task orchestration, esbuild/Vite for bundling
- **Language**: TypeScript (strict mode)
- **Linting/Formatting**: Biome (NOT ESLint or Prettier)
- **Desktop**: Electron with Electron Forge
- **Frontend**: React 19, Tailwind CSS 4
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

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Scopes must match workspace package names exactly:
- `browser` - apps/browser
- `karton` - packages/karton
- `website` - apps/website
- `stage-ui` - packages/stage-ui

Examples:
```bash
feat(stagewise): add dark mode toggle
fix(karton): resolve connection timeout
```

Sub-scopes like `browser-ui` are NOT valid - use the parent package scope.

## Pre-commit Hooks

Lefthook runs on commit:
1. Biome formats staged files
2. Biome check runs on all files
3. Typecheck runs for browser app (if browser files changed)
4. Commitlint validates commit message format

## Workspace Dependencies

- Use `workspace:*` protocol for inter-package dependencies
- Add to root: `pnpm add <package> -w`
- Add to specific package: `pnpm add <package> --filter <package-name>`

## Browser App Architecture

The main Electron app (`apps/browser`) has multiple TypeScript configs:
- `tsconfig.ui.json` - React UI code
- `tsconfig.backend.json` - Electron main process
- `tsconfig.web-content-preload.json` - Preload scripts
- `tsconfig.storybook.json` - Storybook configuration

Key dependencies include AI SDK integrations (@ai-sdk/anthropic, @ai-sdk/openai, etc.), TipTap for rich text editing, and TanStack Router.

## Important Notes

1. **Biome is the linter/formatter** - NOT ESLint or Prettier
2. **Always run `pnpm check:fix` before committing**
3. **TypeScript strict mode** is enabled - handle all type errors
4. **Turbo caching** is enabled - build outputs are cached
5. **The browser app uses Electron Forge** for packaging and distribution
