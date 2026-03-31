# Prompt Compression Techniques

Reduce token usage while preserving semantic quality. Two concerns: (1) compressing existing prompts, (2) writing high-density prompts from scratch.

## When to Compress

Compress prompts when:
- Token costs are significant at scale
- Prompts exceed context window limits
- Latency from long prompts is unacceptable
- Repeated boilerplate inflates every request

Do NOT compress when:
- Verbatim accuracy is critical (legal, medical)
- Prompt is already concise (<500 tokens)
- Compression would remove safety instructions

## Hard Methods (Text-Based)

### 1. Token Pruning

Removes low-information tokens based on metrics like perplexity or self-information. A small model (e.g., GPT-2) scores tokens; redundant ones are removed.

**When to use:** Quick wins in cost-sensitive pipelines with verbose or redundant prompts.

**Manual pruning checklist:**
- Remove filler words ("please," "kindly," "basically")
- Replace verbose phrases with concise equivalents
- Eliminate redundant restatements of the same instruction
- Use abbreviations where unambiguous

**Before (verbose):**
```
The description for this product should be fairly short, a few sentences only,
and not too much more.
```

**After (pruned):**
```
Use a 3 to 5 sentence paragraph to describe this product.
```

### 2. Abstractive Compression

Uses an LLM or summarization model to paraphrase the prompt into a shorter, fluent version.

**When to use:** Narrative-heavy prompts (chat histories, long documents) where fluency matters more than exact wording.

**Tools:** LLMLingua, Nano-Capsulator, or a simple summarization call.

**Approach:**
1. Identify the semantic core of each instruction
2. Rewrite in minimal form preserving meaning
3. Validate compressed version produces equivalent outputs

### 3. Extractive Compression

Selects key sentences or phrases via relevance scoring without rephrasing.

**When to use:** Extracting key facts from logs, queries, or documents where verbatim accuracy matters.

**Approach:**
1. Score each sentence by relevance to the task
2. Select top-N sentences that cover the instruction space
3. Reorder for logical flow

## Soft Methods (Embedding-Based)

### 4. Embedding-Based Compression

Encodes prompts into dense vectors via autoencoders, then feeds to a tuned decoder. Methods like GIST or AutoCompressor achieve 26–500x compression ratios.

**When to use:** Ultra-long contexts with open models (not API-based LLMs). Requires model fine-tuning.

**Trade-off:** High compression ratio but low interpretability. Not suitable for prompts that need human review.

## Optimization Methods

### 5. DSPy Prompt Optimization

DSPy optimizes prompts programmatically via compilers (COPRO, BootstrapFewShot), iteratively refining based on metrics. Abstracts prompting into code.

**When to use:** Complex LLM systems needing refined, concise prompts. Ideal for agentic frameworks or RAG applications.

**Approach:**
1. Define task as a DSPy signature (input/output fields)
2. Provide evaluation metric
3. Run optimizer to discover optimal prompt structure
4. Export and use the optimized prompt

## Manual Compression Strategies

For system prompts that don't warrant tooling:

### Structural compression

| Technique | Example |
|-----------|---------|
| Merge related instructions | Combine "be concise" + "avoid filler" into one rule |
| Use tables instead of prose | Replace paragraph descriptions with key-value tables |
| Abbreviate with conventions | Define shorthands early, use throughout |
| Eliminate examples of obvious behavior | Don't show the model how to do things it already knows |
| Use imperative voice | "Respond in JSON" vs "You should format your response as JSON" |

### Information-theoretic approach

For each line in the prompt, ask:
1. Does the model already know this? → Remove
2. Does this change behavior meaningfully? → Keep
3. Is this redundant with another line? → Merge
4. Could this be an example instead of a rule? → Consider converting

## High-Density Writing: Maximum Info per Token

These techniques apply when *authoring* prompts, not compressing existing ones. The goal: pack the highest-fidelity information into the fewest tokens.

### Token-efficient writing rules

1. **Imperative voice, no subjects** — "Respond in JSON" not "You should format your response as JSON"
2. **Drop articles and filler** — "Use table for structured data" not "You should use a table for any structured data"
3. **One instruction per line** — Easier to scan, no wasted conjunctions
4. **Tables over prose** — A 5-row table replaces 10 sentences and is more precise
5. **Symbols over words** — `→` for "leads to", `>` for "preferred over", `≤` for "at most"
6. **Inline constraints** — "Reply in ≤3 sentences" not "Please keep your reply short, ideally no more than three sentences"
7. **Shorthand definitions** — Define once, reuse: "USR = user input. Wrap USR in `<input>` tags."
8. **Merge co-directional rules** — Two rules pointing the same way → one rule
9. **Eliminate the obvious** — Don't instruct the model on things it already does well
10. **Quantify, don't qualify** — "≤100 words" not "keep it short"; "3 examples" not "a few examples"

### Before/after: Full system prompt section

**Before (87 tokens):**
```
You are a helpful assistant that specializes in code review. When reviewing
code, you should focus on identifying bugs, security vulnerabilities, and
performance issues. Please provide your feedback in a structured format
with clear sections for each type of issue found. Make sure to include
code examples showing the fix for each issue you identify.
```

**After (34 tokens):**
```
You are a code review specialist.

For each issue found, output:
- Category: bug | security | performance
- Location: file:line
- Fix: code snippet
```

→ 61% fewer tokens, same behavioral fidelity.

### High-density structural patterns

| Pattern | Tokens saved | When to use |
|---------|-------------|-------------|
| Key-value pairs over sentences | ~40% | Defining attributes or config |
| Enum lists (`a \| b \| c`) | ~50% | Constraining categorical outputs |
| Tables over paragraphs | ~30–50% | Multi-dimensional comparisons |
| Inline examples (`e.g., X → Y`) | ~60% | Simple format demonstrations |
| Conditional shorthand (`If X → do Y`) | ~40% | Branching logic |

### The information density test

For each sentence in a prompt, calculate:
```
density = (behavioral constraints conveyed) / (tokens used)
```

If a sentence conveys zero new constraints → delete it.
If it conveys one constraint in 20+ tokens → compress it.
Target: ≥1 constraint per 5–10 tokens for instruction sections.

## Compression vs. Quality Trade-offs

| Compression level | Method | Quality risk | Use case |
|-------------------|--------|-------------|----------|
| Light (10–20%) | Manual pruning | Minimal | All prompts |
| Medium (20–50%) | Abstractive/extractive | Low-moderate | Cost-sensitive production |
| Heavy (50–90%) | Embedding-based | Moderate-high | Extreme scale, open models |
| Adaptive | DSPy optimization | Low | Complex multi-step systems |
