# Workflow & Pattern References

How to write per-process reference files for a skill.

## When to Create a Process Reference File

Create one file per process, workflow, or recurring pattern. Name the file after the process itself — e.g. `render-loops-debugging.md`, `data-fetching-patterns.md`, `release-flow.md`.

Create one when a process has:
- Steps where order matters and the wrong order causes real problems
- Atomic operations (primitives) that recur within that process
- Non-obvious tool combinations or sequencing
- Patterns that emerged from actual use and were validated

Never bundle unrelated processes into one file. The agent should load only the file relevant to the current task.

If the process is stateless lookup (e.g. "what color is this token?"), skip it.

---

## Structure

### Complete Workflows

Document end-to-end procedures for the most common tasks. Each workflow should be:
- Named after what the user wants to achieve
- Ordered steps (numbered list)
- Concrete — reference real tools, file paths, commands where applicable
- Closed — the reader knows when they're done

**Template:**
```markdown
## Add a New X

1. Create `path/to/file` with the following structure: ...
2. Register it in `path/to/index` by adding: ...
3. Run `pnpm typecheck` to verify
4. Expected result: ...
```

### Primitives

Primitives are atomic, named operations that recur across multiple workflows. Documenting them:
- Reduces repetition in workflow descriptions ("run the standard build check" → one place)
- Makes it easy to compose new workflows from known building blocks
- Encodes the "right way" to do a small thing

**Template:**
```markdown
## Primitives

### Run Type Check
```bash
pnpm -F <package> typecheck
```
Use after any structural change to types, imports, or exports.

### Reload Bundled Skills
Restart the Electron app — skills are discovered at startup via `discoverSkills(getBuiltinSkillsPath())`.
No hot-reload; a restart is always required after adding/editing bundled skills.
```

### Behavior Patterns

Behavior patterns are higher-level: recurring approaches or heuristics that apply across tasks, not tied to a specific sequence.

**Template:**
```markdown
## Patterns

### Read Before Edit
Always `read` a file before `multiEdit`. Never edit blind.

### Parallel Independent Calls
When multiple tool calls don't depend on each other, issue them in the same step.
```

---

## Example: `react-best-practices` Skill

This skill has several distinct processes. Each gets its own file:

```
react-best-practices/
├── SKILL.md
└── references/
    ├── render-loops-debugging.md
    ├── data-fetching-patterns.md
    ├── state-colocation.md
    └── best-practices.md
```

**`references/render-loops-debugging.md`:**
```markdown
# Render Loop Debugging

## Workflow

1. Add `console.count('ComponentName render')` inside the component
2. Reproduce the interaction that triggers excess renders
3. Check which props/state changed using React DevTools Profiler
4. Identify the referentially unstable value (new object/array/function each render)
5. Fix: wrap with `useMemo` / `useCallback`, or move the value outside the component

## Primitives

### Check referential stability
```js
useEffect(() => { console.log('value changed', value); }, [value]);
```
Use to isolate which dependency is unstable.

### Stabilize a derived array
```js
const items = useMemo(() => source.filter(fn), [source, fn]);
```
```

The agent working on a render performance issue loads `render-loops-debugging.md`. An agent doing data fetching loads `data-fetching-patterns.md`. Neither loads what it doesn't need.

---

## Anti-Patterns

- **Too abstract**: "Do the thing the right way" → useless. Be concrete.
- **Duplicating SKILL.md**: If the workflow is already in SKILL.md, don't repeat it here — reference it.
- **Missing the "done" signal**: Every workflow needs a clear termination condition.
- **No primitives section**: If you wrote more than two workflows and they share steps, extract those steps as primitives.
