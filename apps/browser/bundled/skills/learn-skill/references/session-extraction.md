# Session Extraction

How to turn a conversation into a skill.

## When to Use This Mode

The user referenced the current session: "learn-skill for all of this", "capture what we just figured out", "extract a skill from above", "remember this for next time", etc.

## Extraction Checklist

### Step 1 — Scan for Signal

Go through the full conversation and collect:

- **Decisions** — choices made between alternatives, and why. E.g. "we use esbuild not tsc for the build because..."
- **Constraints** — hard rules that must be followed. E.g. "always use pnpm, never npm"
- **Patterns** — approaches that worked and were validated. E.g. "to add a builtin skill, drop a folder in bundled/skills/"
- **Workflows** — sequences of steps that were performed. E.g. read → multiEdit → typecheck
- **Gotchas / resolutions** — problems encountered and how they were resolved
- **Domain facts** — non-obvious truths about the codebase, API, or system that aren't obvious from the code
- **Recurring primitives** — atomic operations that were repeated or composed

### Step 2 — Filter

Remove:
- General knowledge the agent already has (TypeScript syntax, React patterns, etc.)
- Transient state that won't be valid next session (e.g. "file X currently has a bug")
- Steps that are obvious from reading the code
- Discussion that was superseded by a later decision

Keep:
- Project-specific conventions
- Non-obvious sequencing or tool choices
- Decisions where the wrong default would cause real problems
- Patterns that saved significant time

### Step 3 — Determine Scope

Ask yourself (or the user if unclear):
- **Workspace skill** (`.stagewise/skills/`) — applies to a specific project; uses project paths, tooling, and conventions
- **User skill** (`.agents/skills/`) — applies broadly across projects; reusable methodology

If the extracted knowledge references specific file paths, package names, or repo conventions → workspace skill.

### Step 4 — Name and Describe

- Name: concise noun phrase or gerund describing the domain (`building-browser-plugins`, `managing-remotion-compositions`)
- Description: what it does + when to use it. Include trigger phrases that match how the user naturally invokes the domain

### Step 5 — Structure the Output

Distribute content:
- **SKILL.md**: context, scope, key decisions, entry point for main workflow
- **references/{process-name}.md**: one file per distinct process or pattern identified in the session → see `workflow-patterns.md`
- **references/best-practices.md**: constraints, rules, gotchas
- **references/domain-facts.md**: non-obvious truths about the system

If the session was short or narrow, a single SKILL.md with no references may be sufficient.

### Step 6 — Write

Write to the appropriate path. After writing, show the user:
- What was captured
- What was deliberately excluded (and why)
- The full path of each file written

## Quality Bar

A good extracted skill should let a fresh agent — with no memory of the session — make the same decisions, avoid the same pitfalls, and follow the same patterns without re-asking the user.

## Example Signal vs. Noise

| Conversation content | Extract? |
|---|---|
| "use pnpm, not npm" | ✅ constraint |
| "we put builtins in `bundled/skills/`" | ✅ convention |
| "`agentInvocable` has no effect on builtins" | ✅ gotcha |
| "to add a route, use TanStack Router" | ✅ if project-specific |
| "TypeScript generics work like this..." | ❌ general knowledge |
| "file X had a bug that we fixed" | ❌ transient state |
| "I tried option A first but then picked B" | ✅ decision + rationale (keep B + why) |
