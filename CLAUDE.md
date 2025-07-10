# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stagewise is a browser toolbar that connects frontend UI to AI code agents in code editors. It enables "visual vibe coding" by allowing developers to visually select elements in their web apps and communicate with AI agents to modify the corresponding code. The toolbar works with Cursor, VS Code, Windsurf, Trae, Cline, GitHub Copilot, and other AI-powered editors.

## Architecture

This is a **pnpm monorepo** using Turborepo for build orchestration. Key directories:

- `apps/` - Applications (website, vscode-extension)
- `packages/` - Shared packages (srpc, ui, agent-interface, etc.)
- `toolbar/` - Framework-specific toolbar implementations
- `plugins/` - Plugin system for extending functionality
- `examples/` - Framework examples (Next.js, Vue, Angular, etc.)

## Essential Commands

```bash
# Development
pnpm dev              # Start all dev servers (concurrency 20)
pnpm dev:toolbar      # Start only toolbar packages
pnpm dev:examples     # Start example projects

# Building
pnpm build            # Build all packages
pnpm build:apps       # Build only applications
pnpm build:packages   # Build only packages

# Code Quality
pnpm check            # Run Biome linter/formatter
pnpm check:fix        # Auto-fix linting/formatting issues
pnpm typecheck        # TypeScript type checking
pnpm test             # Run Vitest tests

# Maintenance
pnpm changeset        # Create changeset for version management
pnpm clean            # Clean node_modules
pnpm clean:workspaces # Clean turbo cache and build outputs
```

## Working with Specific Packages

```bash
# Run commands in specific packages
pnpm --filter <package-name> <command>

# Examples:
pnpm --filter @stagewise/srpc test
pnpm --filter website dev
```

## Testing

- Tests use Vitest with configuration in `vitest.config.ts` files
- Run all tests: `pnpm test`
- Test files follow `*.test.ts` pattern

## Development Workflow

1. **Changesets Required**: Every PR must include a changeset (except docs-only changes)
   - Create with: `pnpm changeset`
   - For docs-only: `pnpm changeset --empty`

2. **Commit Format**: Follow conventional commits
   - Format: `type(scope): description`
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
   - Scopes: `website`, `vscode-extension`, `toolbar`, `ui`, etc.

3. **Pre-commit Hooks**: Automatically runs Biome formatting on staged files

4. **VS Code Extension Development**:
   - Open project in VS Code
   - Press F5 to launch Extension Development Host
   - Extension will be loaded in the host window

## Key Technologies

- **TypeScript** - Primary language
- **React 19** - UI framework
- **Next.js 15** - Website framework
- **Tailwind CSS v4** - Styling
- **Biome** - Linting/formatting
- **Vitest** - Testing
- **Supabase** - Authentication/database
- **TRPC** - Type-safe RPC

## Important Constraints

1. **Security**: Toolbar only works on localhost/127.0.0.1 for security
2. **Node Version**: Requires Node.js >= 18
3. **Package Manager**: Must use pnpm 10.10.0
4. **License**: AGPLv3 - Be aware of licensing implications

## Common Development Tasks

### Adding Dependencies
```bash
# Add to root
pnpm add -w <package>

# Add to specific workspace
pnpm add <package> --filter <workspace-name>
```

### Creating a Plugin
```bash
npx create-stagewise-plugin
```

### Testing Locally
1. Clone and install: `pnpm install`
2. Run development: `pnpm dev`
3. Open http://localhost:3002 for example app
4. Install extension in your IDE for full functionality

## Architecture Notes

- **SRPC (Simple RPC)**: Custom RPC library for toolbar-extension communication
- **Agent Interface**: Core protocol for AI agent communication
- **Plugin System**: Extensible architecture using iframe-based plugins
- **Multi-Framework Support**: Separate toolbar packages for React, Vue, Next.js
- **Authentication**: Recently integrated Supabase for auth/database

## Known Issues

- Prompts may be sent to wrong IDE window (#151)
- Dialogs/modals close unexpectedly (#87)
- SSH remote sessions on WSL not supported (#172)