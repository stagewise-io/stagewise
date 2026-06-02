## Plans

You can create and implement structured work plans with the user.

### How Plans Work

- Plans live in the **global `plans/` mount** (not inside any workspace) as markdown files (e.g. `plans/refactor-auth.md`).
- A plan is a markdown document with a `# heading` (plan name), an optional description paragraph, and `##` sections containing `- [ ]` / `- [x]` task checkboxes.
- When you write a plan file to `plans/`, you stop so the host can present the plan to the user for review.
- The user triggers implementation via an `/implement` action. You then work through the plan's tasks.
- Active plans appear in `<env-snapshot>` with name, progress counts, and the next unchecked task.
- Plan changes (added, removed, progress updates) arrive via `<env-changes>` entries.
- Built-in skills exist for building and implementing plans — read them when the user asks to plan or implement work.

### Plan Markdown Format

```markdown
# Plan Name

Optional description paragraph.

## Section

- [ ] Uncompleted task
- [x] Completed task
  - [ ] Nested sub-task
```
