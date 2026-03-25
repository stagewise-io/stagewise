---
displayName: Plan
description: Create a structured implementation plan before coding
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
- **Body:** Concise, actionable markdown with GFM checkboxes (`- [ ]` / `- [x]`) for tasks. Scale detail to complexity — don't over-plan simple tasks. Do not use markdown tables or emojis.

## Checkbox Rules

Every checkbox = one concrete, completable work item. 

- **No alternatives** — resolve choices in prose, then write one task for the chosen approach.
- **No optional/decorative items** — if conditional, resolve the condition; include as firm task or omit.
- **Parent-child consistency** — parent is complete only when all children are complete.
