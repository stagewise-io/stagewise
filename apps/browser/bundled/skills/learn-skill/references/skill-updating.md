# Skill Updating

How to update an existing skill correctly.

## When to Update

Trigger an update when any of the following appear in context:

- **Contradiction** — the user corrected the agent's behavior that was following the skill. The skill told the agent to do X; the user wanted Y instead.
- **Override** — the user ignored or explicitly rejected skill guidance during a session ("no, don't do it that way, do it like this").
- **Confusion signal** — the agent misread or misapplied the skill; the guidance was ambiguous.
- **Deprecated pattern** — code, tools, or APIs referenced in the skill are no longer in use.
- **Redundancy** — the same information appears in multiple places within the skill.
- **Gap confirmed by session** — the skill didn't cover something that turned out to matter.

Do not wait for the user to explicitly say "update the skill". If any of the above are visible in context and the user invokes `/learn-skill`, treat it as an update trigger.

---

## Update Checklist

### Step 1 — Read the Full Skill
Read every file in the skill directory before making any changes. Never update based on partial knowledge of the skill's current content.

### Step 2 — Identify Conflicts
For each conflict found:
- What does the skill currently say?
- What did the user actually want / what worked in practice?
- Is this a genuine contradiction, or a valid exception?

Genuine contradictions → replace. Valid exceptions → add a note to the relevant section.

### Step 3 — Identify Redundancy and Debt
- Same information stated twice (in SKILL.md and a reference, or in two references) → consolidate to one place, remove the other
- Sections that no longer reflect reality → remove or rewrite entirely
- Wording that caused the agent to misapply guidance → rewrite for clarity
- References to tools, paths, or APIs that no longer exist → update or remove

### Step 4 — Apply Changes

**Replace, don't append.** When correcting a contradiction, overwrite the wrong content. Do not add a new section that says "actually, do Y" while leaving the old "do X" in place — that creates contradiction inside the skill itself.

**Edit in place.** Use targeted edits (`multiEdit`) rather than rewriting the whole file, unless the file needs structural reorganisation.

**Maintain line budget.** SKILL.md must stay under 200 lines. If an update would push it over, move detail to a reference file.

### Step 5 — Check Coherence
After applying changes, re-read the affected files and verify:
- No internal contradictions remain
- No orphaned references (a file referenced that no longer exists, or a file that exists but is no longer referenced)
- The description in the frontmatter still accurately describes what the skill does and when to use it

---

## What Not to Do

- **Don't append corrections** — "Note: the above is outdated, actually do X" leaves dead content that confuses future agents. Delete the outdated content.
- **Don't preserve "historical" notes** — skills are not changelogs. Remove superseded content entirely.
- **Don't over-update** — if a session deviated from the skill for a one-off reason (e.g. "just this once, skip the typecheck"), do not encode that exception into the skill.
- **Don't split a small update across too many files** — if a correction is one sentence, fix it in place; don't create a new reference file for it.

---

## Summary Format (after updating)

Always output after completing an update:

```
Updated: {skill-path}
  • Replaced: [brief description of what changed]
  • Removed: [what was deleted and why]
  • Added: [what is new]
  • Unchanged: [what was preserved]
```

If multiple files in the skill were changed, list each file separately.
