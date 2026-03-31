# Workflows

Follow the appropriate workflow end-to-end for create, review, or optimize tasks.

## Workflow 1: Create a New System Prompt

### Phase 1 — Requirements

1. **Define the task** — 1–2 sentence summary of what the model does
2. **Identify audience** — End user, API consumer, or downstream system
3. **Constraints** — Output format, length, tone, safety needs, token budget
4. **Context** — Domain knowledge, schemas, reference data the model needs
5. **Edge cases** — Inputs that could break the prompt (empty, adversarial, ambiguous)

### Phase 2 — Draft

Follow **Prompt Architecture** ordering (SKILL.md):

```
1. Identity/role (1–2 sentences)
2. Core behavior rules (safety, tone, non-negotiables)
3. Task instructions (what to do, how)
4. Context/knowledge (schemas, domain data)
5. Output format (structure, length, style)
6. Few-shot examples (2–3, in <example> tags)
7. Dynamic input slot (delimited, always last)
```

Apply high-density writing at each step (see `compression-techniques.md`):
- Imperative voice, no filler
- Tables over prose for structured info
- Quantify all constraints ("≤100 words", not "short")
- One instruction per line

### Phase 3 — Structure

- Separate sections with XML tags or consistent delimiters
- Isolate user input in clearly labeled tags
- Long reference data above instructions
- Examples in `<example>` tags

### Phase 4 — Safety pass

Check against `safety-and-security.md`:
- [ ] User input delimited, cannot override instructions
- [ ] No PII or secrets in examples
- [ ] Injection-resistant (instruction anchoring, sanitization)
- [ ] Inclusive language, no demographic assumptions
- [ ] Data leakage prevention included

### Phase 5 — Compression pass

Apply **information density test** (from `compression-techniques.md`):
1. Conveys a behavioral constraint? → Keep
2. Model already knows this? → Remove
3. Redundant with another line? → Merge
4. Expressible in fewer tokens? → Compress

Target: ≥1 constraint per 5–10 tokens in instruction sections.

### Phase 6 — Test

1. **Representative inputs** — 5–10 typical use cases
2. **Edge cases** — Empty, very long, special characters, ambiguous
3. **Adversarial** — Prompt injection, bias triggers
4. **Format compliance** — Output matches spec
5. **Model coverage** — All target models

### Phase 7 — Document

- Record purpose, scope, limitations; tag as v1.0
- Note tested models; store alongside consuming code

---

## Workflow 2: Review an Existing Prompt

### Step 1 — Understand intent

What does the prompt achieve? Which model(s)? What inputs?

### Step 2 — Structural audit

Check against Prompt Architecture ordering:

| Section | Present? | Correct position? |
|---------|----------|--------------------|
| Identity/role | | |
| Behavior rules | | |
| Task instructions | | |
| Context/knowledge | | |
| Output format | | |
| Examples | | |
| Input delimiting | | |

### Step 3 — Clarity audit

Apply the **"new colleague" test** to each instruction. Check for:
- [ ] Ambiguous language (multiple interpretations)
- [ ] Negative-only instructions (no positive alternative)
- [ ] Unquantified constraints ("short", "a few")
- [ ] Missing audience/tone/style
- [ ] Over-prompting (CRITICAL/MUST for simple tasks)

### Step 4 — Safety audit

Full checklist from `safety-and-security.md`:
- [ ] User input isolation  — [ ] Injection resistance
- [ ] No PII in examples   — [ ] Bias-free language
- [ ] Data leakage prevention — [ ] Output validation

### Step 5 — Efficiency audit

| Waste type | Example | Fix |
|-----------|---------|-----|
| Filler | "please kindly" | Delete |
| Redundancy | Same rule twice | Merge |
| Obvious | Teaching known behavior | Delete |
| Verbose | "You should make sure to" | Direct form |
| Prose→table | Multi-attribute descriptions | Table |
| Excess examples | 5+ for simple format | 2–3 |

### Step 6 — Anti-pattern scan

Check all 8 anti-patterns from `anti-patterns-and-checklist.md`: ambiguity, verbosity, negative-only, over-prompting, unsanitized input, example overfitting, missing format, buried context.

### Step 7 — Report

```
## Prompt Review: [name]
### Summary — [1–2 sentence assessment]
### Critical (must fix) — [issue] → [fix]
### Improvements — [issue] → [fix]
### Token efficiency — Current: ~N tokens → After: ~N tokens (X% reduction)
### Testing gaps — [untested scenarios]
```

---

## Workflow 3: Optimize for Token Efficiency

Use when a working prompt needs fewer tokens without changing behavior.

### Step 1 — Baseline

- Count tokens (estimate: 1 token ≈ 4 chars)
- Run 5+ test cases, record outputs as quality baseline

### Step 2 — Classify each line

| Tag | Meaning | Action |
|-----|---------|--------|
| **KEEP** | Changes behavior meaningfully | Preserve/compress |
| **MERGE** | Overlaps another instruction | Combine |
| **REMOVE** | Zero behavioral impact | Delete |
| **COMPRESS** | Correct but too many tokens | Rewrite shorter |

### Step 3 — Apply (in order of impact)

1. Delete REMOVE lines
2. Merge MERGE lines
3. Compress using high-density writing rules (`compression-techniques.md`)
4. Convert prose → tables
5. Reduce examples to 2

### Step 4 — Validate

- Rerun baseline test cases; compare outputs
- If quality dropped → restore the instruction that caused it
- Iterate until token target met without quality loss

### Step 5 — Document

Record before/after token counts, behavioral differences, tag new version.
