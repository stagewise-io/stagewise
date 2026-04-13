---
name: Learn
description: Create, extract, or update a skill. Use when authoring a new skill from scratch, extracting knowledge from the current session, or updating an existing skill when the user's intentions contradicted skill guidance or content is confusing/outdated.
user-invocable: true
agent-invocable: false
---

# Learn by writing skills

## Core workflows

### 1. New skills from group up

Invoked with an explicit goal: "create a skill for X". Build the skill from scratch using the structure and principles below. Ask user intensenly about all details and follow users guidance.

### 2. Skill extraction from conversation

Invoked in reference to the current conversation: "learn-skill for what we just did", "capture this session", "extract a skill from all of the above", etc.

**Extraction workflow:**

1. **Scan** the full conversation for: decisions made and their rationale, patterns and approaches that worked, domain-specific facts established, problems encountered and their resolutions, recurring workflows or command sequences
2. **Filter** — extract only non-obvious, context-specific knowledge. Skip generic facts the agent already knows
3. **Determine target workspace** — which workspace does this skill belong to? Ask if unclear
4. **Structure** into a skill (see below), placing content into appropriate files
5. **Write** to `{workspace}/.stagewise/skills/{skill-name}/`

See `references/session-extraction.md` for the full extraction checklist.

### 3. Update of existing skill

Invoked when: the user corrected or overrode something the agent did following a skill, the user wants to update/improve an existing skill, or the current context reveals that a skill's guidance is confusing, wrong, or outdated.

**Update workflow:**

1. **Read** the existing skill in full
2. **Identify conflicts** — content that contradicts what the user actually wanted or what worked in practice
3. **Identify debt** — redundant sections, confusing wording, deprecated patterns observed in context
4. **Replace** contradicting content with the corrected version; do not append — overwrite
5. **Remove** redundancies; every sentence must earn its place.
   - Never duplicate the frontmatter `description` verbatim (or near-verbatim) in the SKILL.md body.
6. **Preserve** everything still accurate and useful

See `references/skill-updating.md` for the full update checklist.

---

## Always: Summarize After Completion

After every create, extract, or update operation, output a compact summary:

- Which skill(s) were **created** — path + one-line description of what was captured
- Which skill(s) were **updated** — path + bullet list of what changed (added / replaced / removed)
- What was **deliberately excluded** and why (for extractions)

Skip the summary only if the user explicitly says not to.

---

## Skill Structure

```
skill-name/
├── SKILL.md                       required, <200 lines
└── references/                    optional, loaded on-demand
    ├── {process-name}.md          one file per workflow or pattern
    ├── best-practices.md          domain rules, constraints, gotchas
    └── ...
```

**SKILL.md frontmatter (required):**

```yaml
---
name: skill-name
description: What it does and when to use it. Be specific — this drives discovery.
---
```

**No frontmatter duplication:** The SKILL.md body must not repeat the frontmatter `description` again. Treat frontmatter as the concise discovery blurb; the body expands with triggers, constraints, and step logic without rephrasing the same sentence(s).

**Use minimum language with high signal-to-noise ratio**: Skills must have high information density. Simple sentences, no fillers, maximized info density.

**References section (required when any reference files exist):**
SKILL.md must list every file in `references/` with a 1–2 sentence description: what the file contains and when the agent should load it. No reference file should exist without an entry here. This is what allows the agent to decide which file to load without reading all of them.

```markdown
## References
- `references/render-loops-debugging.md` — step-by-step workflow for diagnosing excess re-renders. Load when investigating render performance.
- `references/data-fetching-patterns.md` — patterns for fetching in Server/Client Components. Load when working on data fetching.
```

---

## Core Principles

### Concise is Key

Context window is shared. Challenge every sentence: does the agent actually need this, or does it already know it?

**No meta phrasing:** In generated skills, write direct instructions (imperative steps). Avoid wording like “This skill tells you to …” or “In this skill, you will …”. Write the action itself: “Do X, then Y.”

### Progressive Disclosure

- **SKILL.md** (<200 lines): overview, triggers, core steps, pointers to references
- **references/**: detail, examples, edge cases — loaded only when needed
- Keeps activation fast; agents read only what's relevant to the current task

### Workflow & Pattern References

If the domain has recurring processes, debugging approaches, or composable patterns, **give each one its own reference file named after the process** — e.g. in a `react-best-practices` skill: `references/render-loops-debugging.md`, `references/data-fetching-patterns.md`. Never bundle unrelated processes into a single file; the agent should load only the file relevant to the task at hand.

Each process file should contain:

- **Steps** — ordered procedure when sequence matters
- **Primitives** — atomic, named operations that recur within this process
- **Examples** — concrete before/after or input/output pairs

Document processes that emerged from actual use — non-obvious sequencing, specific tool combinations, patterns that worked. Do not omit just because the domain seems simple.

See `references/workflow-patterns.md` for structure and examples.

### Set Degrees of Freedom Appropriately

- **High**: text instructions for tasks with multiple valid approaches
- **Medium**: pseudocode / parameterized scripts
- **Low**: exact scripts for fragile, order-sensitive operations

---

## References

- `references/session-extraction.md` — extraction checklist and patterns for session-derived skills
- `references/skill-updating.md` — update checklist: conflicts, redundancy, deprecated content
- `references/workflow-patterns.md` — how to write effective workflow and primitive references
- `references/skill-structure.md` — full SKILL.md format spec
- `references/progressive-disclosure.md` — 200-line rule details
- `references/best-practices.md` — comprehensive authoring guide
- `references/examples.md` — well-structured skill examples
