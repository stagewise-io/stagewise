---
name: prompt-optimization
description: Guides building, reviewing, and optimizing system prompts and prompt templates for LLMs. Use when creating system prompts, writing prompt templates, optimizing prompt structure, reducing prompt token usage, compressing prompts, improving prompt clarity, reviewing prompts for safety and bias, or making prompts more token-efficient. Also use when the user says "write a prompt," "optimize this prompt," "system prompt," "prompt engineering," "make this prompt better," "reduce tokens," or "compress this prompt."
---

# Prompt Optimization

Build effective, safe, and token-efficient system prompts for LLMs.

## How to Use This Skill

**Pick the workflow that matches the task, then follow it end-to-end:**

| Task | Workflow | Reference |
|------|----------|-----------|
| Write a new prompt from scratch | **Create** workflow | `references/workflows.md` → Workflow 1 |
| Review/audit an existing prompt | **Review** workflow | `references/workflows.md` → Workflow 2 |
| Reduce token count of a working prompt | **Optimize** workflow | `references/workflows.md` → Workflow 3 |

Each workflow references the specific detail pages below as needed. Do not read all references upfront — load them when the workflow step calls for them.

## Core Principles

1. **Clarity over cleverness** — Write prompts a new employee would follow without confusion
2. **Positive framing** — Say what to do, not what to avoid
3. **Structure with delimiters** — XML tags or consistent separators between content types
4. **Progressive specificity** — Role → constraints → instructions → context → format → examples → input
5. **Token economy** — Every token must earn its place; ≥1 constraint per 5–10 tokens
6. **Safety by default** — Prevent injection, data leakage, and bias structurally

## Prompt Architecture (ordering)

```
1. Identity / Role          — Who the model is (1–2 sentences)
2. Core behavior rules      — Non-negotiable constraints (safety, tone)
3. Task instructions        — What to do and how
4. Context / Knowledge      — Domain data, schemas, reference docs
5. Output format            — Structure, length, style requirements
6. Examples (few-shot)      — 2–3 input/output pairs in <example> tags
7. Dynamic input            — User content (always last, always delimited)
```

## Key Rules

- **Delimit user input** — Wrap in tags like `<user_input>`; never interpolate raw
- **Show, don't just tell** — Few-shot examples beat format descriptions
- **Match prompt style to output style** — Markdown in prompt → markdown out; prose → prose
- **Put long documents first** — Reference data above instructions (30%+ quality gain)
- **Quantify, don't qualify** — "≤100 words" not "keep it short"
- **Imperative voice** — "Respond in JSON" not "You should format your response as JSON"
- **Test adversarially** — Injection, edge cases, ambiguous inputs before shipping

## Reference Index

Load these when a workflow step calls for them:

| Reference | Contents |
|-----------|----------|
| `references/workflows.md` | End-to-end workflows for create, review, and optimize tasks |
| `references/clarity-and-structure.md` | XML tags, delimiters, role prompting, long-context patterns |
| `references/output-control.md` | Format steering, verbosity control, few-shot examples |
| `references/safety-and-security.md` | Injection prevention, bias mitigation, data leakage, red-teaming |
| `references/compression-techniques.md` | High-density writing, token pruning, compression methods, density test |
| `references/agentic-prompts.md` | Tool use, thinking/reasoning, state tracking, subagent orchestration |
| `references/anti-patterns-and-checklist.md` | 8 anti-patterns, design checklist, evaluation metrics |
