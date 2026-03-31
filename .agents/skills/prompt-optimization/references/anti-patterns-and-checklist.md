# Anti-Patterns and Evaluation Checklist

Common prompt engineering mistakes and a systematic evaluation framework.

## Anti-Patterns

### 1. Ambiguity

Multiple possible interpretations lead to inconsistent outputs.

**Bad:**
```
Fix this code.
```

**Good:**
```
Review this JavaScript function for bugs and performance issues.
Focus on error handling, input validation, and memory leaks.
Provide specific fixes with explanations.
```

### 2. Excessive verbosity

Wasted tokens on politeness, hedging, or redundant explanation.

**Bad:**
```
Please, if you would be so kind, could you possibly help me by writing
some code that might be useful for creating a function that could potentially
handle user input validation, if that's not too much trouble?
```

**Good:**
```
Write a function to validate user email addresses.
Return true if valid, false otherwise.
```

### 3. Negative-only instructions

Telling the model what NOT to do without specifying what TO do.

**Bad:** "DO NOT ASK USERNAME OR PASSWORD. DO NOT REPEAT."

**Good:** "Diagnose the problem and suggest a solution. Refer users to help.example.com/faq for account access issues."

### 4. Over-prompting for capable models

Instructions designed to force behavior on weaker models cause overtriggering on stronger ones. Where you wrote "CRITICAL: You MUST use this tool when..." use "Use this tool when..." instead.

### 5. Unsanitized user input

Directly interpolating user content into prompts without delimiters or sanitization.

### 6. Overfitting to specific examples

Prompts that demand exact replication rather than pattern generalization.

**Bad:** "Write code exactly like this: [specific code]"

**Good:** "Write a function following these principles: [general patterns]"

### 7. Missing output format specification

Assuming the model will guess the right format. Always specify.

### 8. Context buried at the bottom

Long documents placed after instructions degrade quality. Put data first, query last.

## Prompt Design Checklist

### Task Definition
- [ ] Task is clearly stated in 1–2 sentences
- [ ] Scope is well-defined (what's included AND excluded)
- [ ] Requirements are specific and measurable
- [ ] Output format is explicitly specified

### Structure
- [ ] Role/identity is declared first (if applicable)
- [ ] Instructions and context are separated with delimiters
- [ ] Long documents appear before queries/instructions
- [ ] Few-shot examples are wrapped in `<example>` tags
- [ ] User input is delimited and isolated

### Clarity
- [ ] No ambiguous instructions (pass the "new colleague" test)
- [ ] Positive framing used (what to do, not what to avoid)
- [ ] Length, tone, audience, and style are specified
- [ ] Constraints are quantified where possible (word count, not "short")

### Safety
- [ ] User input cannot override system instructions
- [ ] Input sanitization is implemented
- [ ] No PII or secrets in examples
- [ ] Tested with injection attempts
- [ ] Tested with bias-triggering inputs
- [ ] Output validation exists for structured responses

### Efficiency
- [ ] No filler words or unnecessary politeness
- [ ] No redundant restatements
- [ ] No instructions for behavior the model already exhibits
- [ ] Tables used instead of prose where appropriate
- [ ] Imperative voice used throughout

### Testing
- [ ] Tested with representative inputs
- [ ] Tested with edge cases (empty, very long, special chars)
- [ ] Tested with adversarial inputs
- [ ] Outputs evaluated against success criteria
- [ ] Tested across target models (if applicable)

## Iterative Refinement Process

1. **Write initial prompt** — Start simple, add specificity as needed
2. **Test with representative inputs** — Run 5–10 typical use cases
3. **Identify failure modes** — Where does the output miss expectations?
4. **A/B test variations** — Compare specific changes, not wholesale rewrites
5. **Add constraints for failures** — Target each failure mode individually
6. **Test with adversarial inputs** — Injection, edge cases, bias triggers
7. **Compress** — Remove tokens that don't change output quality
8. **Document** — Record prompt purpose, limitations, and version history

## Evaluation Metrics

| Metric | What it measures |
|--------|-----------------|
| Accuracy | Output matches expected result |
| Relevance | Output addresses the actual input |
| Safety | No harmful, biased, or leaked content |
| Consistency | Similar inputs produce similar outputs |
| Efficiency | Token usage relative to output quality |
| Format compliance | Output matches specified structure |

## Version Control

Track prompt changes like code:
- Maintain a changelog with dates and rationale
- Tag stable versions before major changes
- Keep baseline versions for regression comparison
- Document which model versions prompts were tested against
