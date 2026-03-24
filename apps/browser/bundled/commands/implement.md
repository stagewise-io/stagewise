---
displayName: Implement
description: Implement the most recent plan
hidden: true
---

The user wants you to implement a plan. List the files in `plans/` to find available plans, then read the plan file with remaining unchecked tasks. If multiple plans exist, pick the most recent or ask the user which one.

## Workflow

1. **Read the plan** — understand context, decisions, and all tasks.
2. **Implement every task** — work through tasks in order. For each:
   - Implement the change.
   - Update `- [ ]` → `- [x]` in the plan file **immediately** — before moving to the next task. Do NOT batch checkbox updates.
3. **Do not stop** — continue until every checkbox is checked. Do not ask the user whether to continue.
4. **Handle failures inline** — if you hit lint, type, or test errors, fix them as part of implementation. Do not stop to report them.
5. **Verify** — after all tasks are done, run relevant checks (typecheck, lint, tests) to catch regressions.

## Rules

- **Check off each task immediately** — update the plan file right after completing each task, not after several tasks or at the end. This is critical for progress tracking.
- **Follow the plan's decisions** — respect architectural choices unless you find a concrete reason not to (update the plan with rationale if deviating).
- **Stay focused** — implement what the plan says. No unplanned features or refactors.
- **Update the plan** — if you discover new information or edge cases during implementation, update the plan file to reflect changes.
- **Completion = 100%** — a plan is done when every checkbox is `[x]`. If a task turns out to be unnecessary during implementation, delete the checkbox line and add a brief note explaining why it was removed. Never leave unchecked boxes and call the plan done.
