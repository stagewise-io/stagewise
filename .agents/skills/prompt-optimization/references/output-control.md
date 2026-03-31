# Output Control

Techniques for steering model output format, verbosity, and style.

## Positive Framing

Tell the model what to do, not what to avoid. Negative instructions are unreliable.

| Instead of | Try |
|------------|-----|
| "Do not use markdown" | "Respond in flowing prose paragraphs" |
| "Don't be verbose" | "Keep responses under 100 words" |
| "Don't list items" | "Incorporate items naturally into sentences" |
| "Don't ask for PII" | "Refer users to help.example.com/faq for account issues" |

## Format Steering Techniques

### 1. Explicit format specification

```
Respond in this exact JSON format:
{
  "summary": "one-sentence summary",
  "key_points": ["point 1", "point 2"],
  "confidence": 0.0 to 1.0
}
```

### 2. XML format indicators

```
Write the analysis in <analysis> tags and the recommendation in <recommendation> tags.
```

### 3. Match prompt style to desired output

The formatting in your prompt influences the response. Remove markdown from prompts if you want plain-text output.

### 4. Show, don't just tell

Provide a concrete example of the desired output format. Models generalize from examples more reliably than from descriptions.

## Controlling Verbosity

Modern models default to concise output. If you need more detail:

```
After completing a task involving tool use, provide a quick summary of the work done.
```

If the model is too verbose:

```
Respond concisely. Omit preambles, conclusions, and summaries unless explicitly requested.
Maximum 3 sentences per response.
```

## Reducing Markdown Overuse

For prose-heavy outputs where markdown formatting is unwanted:

```xml
<formatting_rules>
Write in clear, flowing prose using complete paragraphs.
Reserve markdown for: inline code, code blocks, and simple headings.
Avoid bold, italics, and bullet points unless presenting truly discrete items.
Incorporate lists naturally into sentences.
</formatting_rules>
```

## LaTeX Control

Models may default to LaTeX for math. For plain text:

```
Format math in plain text only. Do not use LaTeX, MathJax, or markup
like \( \), $, or \frac{}{}. Use "/" for division, "*" for multiplication,
"^" for exponents.
```

## Few-Shot Examples for Output Format

Wrap examples in `<example>` tags so the model distinguishes them from instructions:

```xml
<examples>
  <example>
    <input>Quarterly revenue increased 15% YoY</input>
    <output>{"metric": "revenue", "change": "+15%", "period": "quarterly", "comparison": "YoY"}</output>
  </example>
  <example>
    <input>Monthly active users declined by 3%</input>
    <output>{"metric": "MAU", "change": "-3%", "period": "monthly", "comparison": null}</output>
  </example>
</examples>
```

Make examples:
- **Relevant** — Mirror actual use cases
- **Diverse** — Cover edge cases and variations
- **Structured** — Clear input/output separation

## Specificity Checklist

When defining output requirements, specify:
- [ ] Length (word count, sentence count, or character limit)
- [ ] Tone (formal, conversational, technical)
- [ ] Audience (junior dev, executive, end user)
- [ ] Format (JSON, markdown, prose, XML)
- [ ] Scope (what to include *and* exclude)
- [ ] Style (active voice, third person, imperative)
