---
displayName: Plan
description: Create a structured implementation plan before coding
---

The user is requesting a structured implementation plan. Follow these instructions:

## Workflow

1. **Research thoroughly** — read all affected files, trace data flow, check imports/exports. Understand the full change surface before writing anything.
2. **Clarify unknowns** — if anything is genuinely ambiguous, batch your questions into a single `askUserQuestions` call. Only ask what you cannot determine from code. Do not ask trivially answerable questions.
3. **Write the plan** — create a `.md` file in `plans/`.
4. **Stop and wait** — present a summary and ask for approval. **Do NOT implement until the user confirms.**

## Plan File Format

```markdown
# Plan Title

One-sentence description of what this plan achieves.

## Context & Key Decisions
<!-- Research findings, architecture decisions, rationale -->

### Section
- [ ] Task 1
- [ ] Task 2
  - [ ] Sub-task 2a

## Edge Cases & Risks
```

**Rules:**
- Filename: kebab-case `.md` in `plans/` (e.g. `plans/add-auth-flow.md`).
- The file **must** start with a `# heading` (h1) — this is the plan's display name in the UI.
- The line after the heading **must** be a short plain-text description (one sentence) — this is used as the plan's summary in the UI.
- Use standard GFM checkboxes: `- [ ]` (incomplete) and `- [x]` (complete).

### Checkbox Rules (Critical)

Every checkbox **must** represent a concrete, actionable task that will be completed during implementation. Violating these rules produces broken progress tracking.

- **No choice menus** — do NOT use checkboxes for alternatives/options (e.g. "Option A / OR Option B"). Make the decision in "Context & Key Decisions" using prose, then write a single task for the chosen approach.
- **No optional tasks** — every checkbox must be completed. If something is conditional, resolve the condition during planning and either include it as a firm task or omit it.
- **No decorative checkboxes** — do not wrap headings, labels, or informational notes in checkboxes. Checkboxes are for work items only.
- **Parent-child consistency** — if a parent task has sub-tasks, the parent is complete when all sub-tasks are complete. Do not check a parent while leaving children unchecked.

## Quality Bar

The plan must be **self-contained and unambiguous** — it should be implementable without further user input. Before writing:
- Verify you've read every component/file the change touches.
- Confirm you understand the data flow end-to-end.
- Ensure each task is specific enough to act on without guessing.
- Verify every checkbox is an actionable work item (no choices, no optionals).
