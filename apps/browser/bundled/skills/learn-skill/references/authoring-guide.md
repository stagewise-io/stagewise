# Skill Authoring Guide

Naming, descriptions, quality, evaluation. Load for guidance beyond SKILL.md basics.

---

## Naming

Use **gerund form**: `processing-pdfs`, `managing-databases`, `writing-documentation`.  
Alternatives: noun phrase (`pdf-processing`) or action form (`process-pdfs`).  
**Avoid:** `helper`, `utils`, `tools`, vague single-word names.

---

## Descriptions

`description` drives discovery — agent reads it to decide whether to load the skill.

- Third person (injected into system prompts)
- What it does + when to use it + trigger phrases
- Include key domain terms. Be specific.

**✅ Good:**
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**❌ Bad:**
```yaml
description: Helps with documents
```

---

## Bundled resources

**`scripts/`** — executable code for deterministic ops.
- Node.js or Python over Bash (better Windows compat)
- Python → include `requirements.txt`
- `.env` load order: `process.env` > `~/.agents/skills/${SKILL}/.env` > `~/.agents/skills/.env` > `~/.agents/.env`
- Always write tests. Add `.env.example`.

**`assets/`** — files used in output (templates, icons, boilerplate). Not loaded into context.

---

## Structure — good vs. bad

**✅ Balanced:**
- SKILL.md ~100–150 lines, all universal rules inline
- 2–4 references, each tied to specific trigger/use-case
- Agent handles common case from SKILL.md alone; 1 reference max for specific workflows

**❌ Over-fragmented:**
- SKILL.md too minimal → agent must load all references for anything
- Universal rules in references → may never be loaded

**❌ Monolithic:**
- 1000+ line SKILL.md, no references → slow, hard to navigate

---

## Content rules

**No time-sensitive info.** Don't write "if before Aug 2025 do X". Use `<details>` or "old patterns" section for deprecated content.

**One term per concept.** "endpoint" not "endpoint/URL/route/path". "field" not "field/box/element/control".

**Forward slashes only** in paths: `scripts/helper.py` not `scripts\helper.py`.

**One clear default.** Pick a tool. Don't leave choice to agent. Mention alternatives only for genuine edge cases.

---

## Anti-patterns

| ❌ Pattern | Problem |
|---|---|
| "Do the thing correctly" | Too abstract — useless |
| Body restates frontmatter `description` | Duplication |
| "Note: above is outdated, actually do X" | Dead content — overwrite, don't append |
| Universal rules in references | May be skipped → missed |
| Reference file not listed in SKILL.md | Invisible to agent |
| `SKILL.md → ref-a.md → ref-b.md` | Ref chain — all refs link from SKILL.md only |

---

## Evaluation + iteration

Build evals before extensive docs — ensures skill solves real problems.

1. **Identify gaps** — run agent on representative tasks without skill; document failures
2. **Create evals** — 3 scenarios targeting those gaps
3. **Baseline** — measure agent without skill
4. **Write minimal content** — just enough to pass evals
5. **Iterate** — run evals, compare to baseline, refine

One agent instance authors; second instance tests on real tasks. Test agent struggles → bring specifics back to authoring agent.

---

## Quality checklist

- [ ] Description: specific, trigger phrases, third person
- [ ] Body doesn't restate frontmatter `description`
- [ ] SKILL.md <200 lines (up to ~500 if justified)
- [ ] Common case handled from SKILL.md alone (+ 1 ref max)
- [ ] Every reference listed with clear load trigger
- [ ] No time-sensitive info
- [ ] Consistent terminology throughout
- [ ] All refs one level deep from SKILL.md
- [ ] Degrees of freedom match task fragility
- [ ] Forward slashes in all paths
