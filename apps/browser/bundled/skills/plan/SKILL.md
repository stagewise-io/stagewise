---
name: Plan
description: Create a structured implementation plan before coding
user-invocable: true
agent-invocable: false
---

You must create a structured implementation plan. Follow these instructions:
## Workflow

1. **Research** — read all affected files, trace data flow, understand the full change surface.
2. **Clarify** — if genuinely ambiguous, batch questions into one `askUserQuestions` call.
3. **Write** — create a kebab-case `.md` in `plans/`.
4. **Stop** — present a summary and wait for approval. Do NOT implement until the user confirms.

## Plan File Spec

- **Line 1:** `# Plan Title` (h1) — used as display name in UI.
- **Line 2:** One-sentence plain-text description — used as summary in UI.
- **Body:** Freeform markdown. Use whatever sections best explain the change — Problem, Approach, Context, Changes, File Map, Key Details, etc. No fixed structure required; scale detail to complexity. Do not use emojis.
  - **Self-contained:** A fresh agent with no prior context should be able to implement the plan without re-researching the codebase. Include relevant file paths (mount-prefixed, e.g. `w4ba9/src/...`), current behavior, key decisions and rationale in prose sections. Omit sections that add no value.
  - **Checkboxes:** Use GFM checkboxes (`- [ ]`) for tasks. See Checkbox Rules below.

## Checkbox Rules

Every checkbox = one concrete, completable work item.

- **Short label** — the `- [ ]` line is a concise, scannable summary (one sentence). It says *what* to do, not *how*.
- **Details below** — implementation specifics (file paths, code snippets, sub-steps) go in indented content underneath the checkbox line. Never cram these into the checkbox line itself.
- **No alternatives** — resolve choices in prose above, then write one task for the chosen approach.
- **No optional/decorative items** — if conditional, resolve the condition; include as firm task or omit.
- **Parent-child consistency** — parent is complete only when all children are complete.

### Example

```markdown
# Rename Commands to Skills

Rename all "command" terminology to "skill" across shared types, backend, and UI.

## Context

The codebase currently uses "command" (`CommandDefinition`, `CommandSource`, etc.) but the
user-facing terminology has shifted to "skill". The rename touches 3 files and 6 import sites.

## Tasks

- [ ] Rename `CommandDefinition` type and its source file

  Rename `w4ba9/src/shared/commands.ts` → `skills.ts`. Inside the file:
  - `CommandSource` → `SkillSource`
  - `CommandDefinition` → `SkillDefinition`
  - `toCommandDefinitionUI` → `toSkillDefinitionUI`

  Update all 6 import sites listed in the Context section.

- [ ] Update Karton state key from `commands` to `skills`

  In `w4ba9/src/shared/karton-contracts/ui/index.ts` (line ~629),
  change the state key and update the JSDoc comment above it.

- [ ] Verify typecheck passes

  Run `pnpm -F stagewise typecheck` for both `tsconfig.ui.json` and `tsconfig.backend.json`.
```
