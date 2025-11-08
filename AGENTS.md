# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm workspaces + Turborepo.
- Key roots: `apps/` (CLI, VS Code extension, website), `packages/` (shared libs), `toolbar/` (core + SDK), `plugins/` (framework plugins), `agent/` (agent runtime/utils), `examples/` (integration samples).
- Tests live near sources in `tests/**` or `*.test.ts` files.

## Build, Test, and Development Commands
- Setup: `pnpm install` (Node >= 18, pnpm 10.x).
- Develop all: `pnpm dev` (Turbo watch across workspaces).
- Build all: `pnpm build` (Turbo build). Filters: `pnpm build:apps`, `pnpm build:packages`, `pnpm build:plugins`, `pnpm build:toolbar`.
- Typecheck: `pnpm typecheck`.
- Lint/format: `pnpm check` (read-only), `pnpm check:fix` (writes fixes). Pre-commit runs Biome on staged files.
- Tests: `pnpm test` (Vitest via Turbo). Per package, e.g. `pnpm -F apps/cli test` or `pnpm -F apps/cli test:coverage`.
- Repo hygiene: `pnpm clean:workspaces`, versioning/changesets: `pnpm changeset`.

## Coding Style & Naming Conventions
- Biome enforced: 2-space indent, 80-char line width, single quotes, semicolons.
- TypeScript-first; prefer `.ts/.tsx`. Use camelCase (functions/vars), PascalCase (components/classes), kebab-case (dirs/files when applicable).
- Keep modules focused; avoid cross-package imports except via published/linked package entrypoints.

## Testing Guidelines
- Framework: Vitest. Co-locate unit tests under `tests/unit/**` or alongside as `*.test.ts`; integration under `tests/integration/**`.
- Aim to cover new logic; run `test:coverage` where available.
- Example: `pnpm -F agent/project-information test`.

## Commit & Pull Request Guidelines
- Conventional Commits via commitlint (scope optional). Examples:
  - `feat(cli): add proxy flag`
  - `fix(toolbar-core): prevent null selector`
- Open PRs with: clear description, linked issues, screenshots for UI-affecting changes, and a changeset if any published package behavior changes.

## Security & Configuration Tips
- Never commit secrets. Use `.env.local` and keep `.env*` files out of PRs.
- Validate with `pnpm check` and `pnpm test` before pushing.

## Agent-Specific Instructions
- Keep diffs minimal and scoped to one package at a time.
- Update related docs/examples when changing public APIs.
- Do not bypass tooling; let Biome/TypeScript fix and catch issues.
