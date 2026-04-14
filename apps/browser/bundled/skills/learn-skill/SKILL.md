---
name: Learn
description: Create, extract, or update a skill. Use when authoring a new skill from scratch, extracting knowledge from the current session, or updating an existing skill when the user's intentions contradicted skill guidance or content is confusing/outdated.
user-invocable: true
agent-invocable: false
---

# Learn: write skills

## Workflows

### 1. New skill from scratch

Trigger: "create a skill for X". Ask user intensively, follow their guidance. Build using structure + rules below.

### 2. Extract from conversation

Trigger: "learn-skill for what we did", "capture this", "extract a skill from above".

1. **Scan** — collect: decisions + rationale, constraints, working patterns, workflows, gotchas, non-obvious domain facts
2. **Filter** — keep only non-obvious, project-specific knowledge. Cut what agent already knows.
3. **Scope** — workspace skill (`.stagewise/skills/`) if content uses specific paths/tooling; user skill (`.agents/skills/`) if broadly reusable
4. **Write** — structure into files using rules below, write to path

→ Load `references/session-extraction.md` for full checklist + signal/noise examples.

### 3. Update existing skill

Trigger: user corrected agent behavior, overrode guidance, skill is wrong/outdated.

1. **Read** full skill before touching anything
2. **Replace** — overwrite wrong content. Never append "Note: above is outdated"
3. **Remove** redundancies. Every sentence earns its place.
4. **Preserve** what's still accurate

→ Load `references/skill-updating.md` for full checklist.

---

## After every operation

Output compact summary:
- **Created** — path + one-line description
- **Updated** — path + bullets: added / replaced / removed
- **Excluded** — what was cut + why (extractions only)

---

## Skill structure

```text
skill-name/
├── SKILL.md           required, target <200 lines
├── references/        optional, on-demand
│   └── *.md
├── scripts/           optional, executable scripts
└── assets/            optional, output files (templates, icons, etc.)
```

**Frontmatter (required):**
```yaml
---
name: skill-name
description: What it does + when to use it. Specific — drives discovery.
---
```

**No frontmatter duplication.** Body must not restate `description`. Frontmatter = discovery blurb. Body = triggers, steps, constraints.

**References section — required if any reference files exist:**
List every file: what it contains + *when to load it*. Unlisted = invisible to agent.

```markdown
## References
- `references/render-loops-debugging.md` — workflow for diagnosing excess re-renders. Load when investigating render performance.
```

---

## Authoring rules

### SKILL.md vs. references

**SKILL.md** → everything needed for the typical case: triggers, core steps, universal constraints.

**References** → content needed only *sometimes*:
- Workflow-specific detail (e.g. extraction checklist, update checklist)
- Examples — illustrative, not required to act
- Rules that apply only in certain cases
- Deep guidance for uncommon situations

**Never put universal rules in references.** Always-applies rule → SKILL.md. Agent might skip references.

**The test:** agent handle common case from SKILL.md alone (or + 1 reference max)? No → split is wrong. Fold needed content back into SKILL.md.

### Writing style — caveman speak

Write dense. Drop articles, filler, throat-clearing. Fragments OK. Use `→`, `=`, `+` as connectors. **Bold** key terms. Keep all technical content.

| ❌ Fluffy | ✅ Caveman |
|---|---|
| "You should make sure to always read the file before editing" | "Read before edit. Always." |
| "This step is important because it ensures that..." | "→ prevents X" |
| "I'd recommend using useMemo to memoize the object" | "Wrap in useMemo." |

Rules:
- Imperative/verb-first: "Do X" not "You should do X"
- No meta phrasing: never "this skill tells you to…"
- One term per concept — never synonyms
- Every sentence must add info agent doesn't already have. Cut the rest.

### Progressive disclosure

- **SKILL.md** → target <200 lines. Up to ~500 acceptable; split when approaching limit.
- **Reference files** → also target <200 lines each.
- **One level deep** — references link from SKILL.md only. No ref → ref chains.

### Degrees of freedom

Match specificity to task fragility:
- **High** (prose): multiple valid approaches, context-dependent
- **Medium** (pseudocode/parameterized): preferred pattern exists, variation OK
- **Low** (exact script): fragile or order-sensitive

---

## References

- `references/session-extraction.md` — extraction checklist, signal/noise examples, scope decisions. Load for workflow 2.
- `references/skill-updating.md` — update checklist: conflicts, redundancy, deprecated content. Load for workflow 3.
- `references/workflow-patterns.md` — how to document per-process workflows (steps, primitives, examples). Load when skill needs to document multiple distinct processes.
- `references/authoring-guide.md` — naming, descriptions, content guidelines, anti-patterns, quality checklist. Load for comprehensive authoring guidance.
