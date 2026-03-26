# Clarity and Structure

Techniques for making prompts unambiguous, well-organized, and easy for models to follow.

## Be Clear and Direct

Models respond best to explicit instructions. Vague prompts produce vague outputs.

**Golden rule:** Show your prompt to a colleague with minimal context. If they'd be confused, the model will be too.

- State the task, output format, and constraints upfront
- Use numbered steps when order matters
- Specify length, tone, audience, and scope explicitly

**Bad — vague:**
```
Write something about APIs.
```

**Good — specific:**
```
Write a 200-word explanation of REST API best practices for junior developers.
Focus on HTTP methods, status codes, and authentication.
Use simple language and include 2–3 practical examples.
```

## Add Context and Motivation

Explaining *why* an instruction matters helps the model generalize correctly.

```
Format outputs as JSON (not markdown) because they are parsed programmatically
by a downstream service that expects valid JSON.
```

## Structure with XML Tags

XML tags eliminate ambiguity when prompts mix instructions, context, examples, and dynamic input.

```xml
<instructions>
Summarize the document in 3 bullet points.
</instructions>

<context>
Target audience: C-level executives with limited technical background.
</context>

<document>
{document_content}
</document>
```

Best practices:
- Use consistent, descriptive tag names across prompts
- Nest tags for hierarchy: `<documents>` → `<document index="1">` → `<content>`
- Keep user-supplied content inside clearly labeled tags

## Role Prompting

A role declaration in the system prompt focuses behavior and tone:

```
You are a senior security architect with 15 years of experience.
Review this authentication design and identify vulnerabilities.
Provide specific recommendations with code examples.
```

Keep roles concise — one or two sentences. Avoid fictional backstories unless they serve the task.

## Long-Context Prompting (20k+ tokens)

When working with large inputs:

1. **Put long data at the top** — Place documents above instructions and queries. Queries at the end improve quality by up to 30%.

2. **Tag each document with metadata:**
```xml
<documents>
  <document index="1">
    <source>Q3 Financial Report</source>
    <document_content>
    ...
    </document_content>
  </document>
</documents>
```

3. **Ground responses in quotes** — Ask the model to extract and cite relevant passages before answering. This cuts through noise in long documents.

```
First, find and quote the sections most relevant to the question.
Then, answer the question based only on the quoted material.
```

## Separator Conventions

| Delimiter | Best for |
|-----------|----------|
| XML tags (`<tag>`) | Structured prompts with multiple content types |
| Triple quotes (`"""`) | Inline text blocks within instructions |
| `###` or `---` | Section breaks in simpler prompts |
| Markdown headers | Human-readable prompt organization |

Choose one convention per prompt and use it consistently.

## Prompt Patterns Summary

| Pattern | When to use |
|---------|-------------|
| **Zero-shot** | Simple, well-understood tasks |
| **Few-shot** | Complex formats, domain-specific outputs |
| **Chain-of-thought** | Multi-step reasoning, math, logic |
| **Role prompting** | Specialized knowledge or perspective |
| **Structured (XML)** | Mixed content types, programmatic parsing |
