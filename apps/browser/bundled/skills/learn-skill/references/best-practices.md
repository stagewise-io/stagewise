# Skill Authoring Best Practices

Comprehensive guide for writing effective skills that agents can discover and use successfully.

## Core Principles

### Concise is Key

The context window is a shared resource. Your skill shares it with conversation history, other skills' metadata, and the actual request. Be concise and challenge each piece of information.

**Default assumption**: Agents are already very smart. Only add context the agent doesn't already have.

**Good example: Concise** (~50 tokens):
````markdown
## Extract PDF text

Use pdfplumber for text extraction:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

**Bad example: Too verbose** (~150 tokens):
```markdown
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well.
First, you'll need to install it using pip. Then you can use the code below...
```

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability.

**High freedom** (text-based instructions):
- Multiple approaches are valid
- Decisions depend on context
- Heuristics guide the approach

**Medium freedom** (pseudocode or scripts with parameters):
- A preferred pattern exists
- Some variation is acceptable
- Configuration affects behavior

**Low freedom** (specific scripts, few or no parameters):
- Operations are fragile and error-prone
- Consistency is critical
- A specific sequence must be followed

### Test with All Models

Skills act as additions to models, so effectiveness depends on the underlying model. Test your skill with all models you plan to use it with.

## Naming Conventions

Use consistent naming patterns. We recommend **gerund form** (verb + -ing) for skill names.

**Good naming examples (gerund form)**:
- `processing-pdfs`
- `analyzing-spreadsheets`
- `managing-databases`
- `testing-code`
- `writing-documentation`

**Acceptable alternatives**:
- Noun phrases: `pdf-processing`, `spreadsheet-analysis`
- Action-oriented: `process-pdfs`, `analyze-spreadsheets`

**Avoid**:
- Vague names: `helper`, `utils`, `tools`
- Overly generic: `documents`, `data`, `files`
- Inconsistent patterns within your skill collection

## Writing Effective Descriptions

The `description` field enables skill discovery and should include both what the skill does and when to use it.

**Important:** The SKILL.md body should not repeat the `description` again. Put the discovery blurb in frontmatter; keep the body focused on triggers, constraints, and the actual procedure.

**Always write in third person**. The description is injected into the system prompt.

- **Good:** "Processes Excel files and generates reports"
- **Avoid:** "I can help you process Excel files"
- **Avoid:** "You can use this to process Excel files"

**Be specific and include key terms**. Include both what the skill does and specific triggers/contexts for when to use it.

**Effective examples:**

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

```yaml
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.
```

**Avoid vague descriptions:**
```yaml
description: Helps with documents  # Too vague
```

## Progressive Disclosure Patterns

### Pattern 1: High-level guide with references

````markdown
# PDF Processing

## Quick start

Extract text with pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## Advanced features

**Form filling**: See [FORMS.md](FORMS.md) for complete guide
**API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
**Examples**: See [EXAMPLES.md](EXAMPLES.md) for common patterns
````

### Pattern 2: Domain-specific organization

For skills with multiple domains, organize content by domain:

```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── reference/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    ├── product.md (API usage, features)
    └── marketing.md (campaigns, attribution)
```

### Pattern 3: Conditional details

Show basic content, link to advanced content:

```markdown
# DOCX Processing

## Creating documents

Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents

For simple edits, modify the XML directly.

**For tracked changes**: See [REDLINING.md](REDLINING.md)
**For OOXML details**: See [OOXML.md](OOXML.md)
```

### Avoid Deeply Nested References

Keep references one level deep from SKILL.md. All reference files should link directly from SKILL.md to ensure agents read complete files when needed.

**Bad example: Too deep**:
```markdown
# SKILL.md
See [advanced.md](advanced.md)...

# advanced.md
See [details.md](details.md)...

# details.md
Here's the actual information...
```

**Good example: One level deep**:
```markdown
# SKILL.md

**Basic usage**: [instructions in SKILL.md]
**Advanced features**: See [advanced.md](advanced.md)
**API reference**: See [reference.md](reference.md)
**Examples**: See [examples.md](examples.md)
```

### Structure Longer Reference Files

For reference files longer than 100 lines, include a table of contents at the top. This ensures agents can see the full scope of available information even when previewing with partial reads.

## Workflows and Feedback Loops

### Use Workflows for Complex Tasks

Break complex operations into clear, sequential steps. For particularly complex workflows, provide a checklist that the agent can copy into its response and check off as it progresses.

**Example: PDF form filling workflow**

````markdown
## PDF form filling workflow

Copy this checklist and check off items as you complete them:

```
Task Progress:
- [ ] Step 1: Analyze the form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill the form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)
```

**Step 1: Analyze the form**

Run: `python scripts/analyze_form.py input.pdf`

This extracts form fields and their locations, saving to `fields.json`.
````

### Implement Feedback Loops

**Common pattern**: Run validator → fix errors → repeat

This pattern greatly improves output quality.

**Example: Document editing process**

```markdown
## Document editing process

1. Make your edits to `word/document.xml`
2. **Validate immediately**: `python ooxml/scripts/validate.py unpacked_dir/`
3. If validation fails:
   - Review the error message carefully
   - Fix the issues in the XML
   - Run validation again
4. **Only proceed when validation passes**
5. Rebuild: `python ooxml/scripts/pack.py unpacked_dir/ output.docx`
6. Test the output document
```

## Content Guidelines

### Avoid Time-Sensitive Information

Don't include information that will become outdated:

**Bad example: Time-sensitive**:
```markdown
If you're doing this before August 2025, use the old API.
After August 2025, use the new API.
```

**Good example** (use "old patterns" section):
```markdown
## Current method

Use the v2 API endpoint: `api.example.com/v2/messages`

## Old patterns

<details>
<summary>Legacy v1 API (deprecated 2025-08)</summary>

The v1 API used: `api.example.com/v1/messages`

This endpoint is no longer supported.
</details>
```

### Use Consistent Terminology

Choose one term and use it throughout the skill:

**Good - Consistent**:
- Always "API endpoint"
- Always "field"
- Always "extract"

**Bad - Inconsistent**:
- Mix "API endpoint", "URL", "API route", "path"
- Mix "field", "box", "element", "control"
- Mix "extract", "pull", "get", "retrieve"

## Common Patterns

### Template Pattern

Provide templates for output format. Match the level of strictness to your needs.

**For strict requirements**:

````markdown
## Report structure

ALWAYS use this exact template structure:

```markdown
# [Analysis Title]

## Executive summary
[One-paragraph overview of key findings]

## Key findings
- Finding 1 with supporting data
- Finding 2 with supporting data
```

**For flexible guidance**:

````markdown
## Report structure

Here is a sensible default format, but use your best judgment:

```markdown
# [Analysis Title]

## Executive summary
[Overview]

## Key findings
[Adapt sections based on what you discover]
```

Adjust sections as needed for the specific analysis type.
````

### Examples Pattern

For skills where output quality depends on seeing examples, provide input/output pairs:

````markdown
## Commit message format

Generate commit messages following these examples:

**Example 1:**
Input: Added user authentication with JWT tokens
Output:
```
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
```

**Example 2:**
Input: Fixed bug where dates displayed incorrectly in reports
Output:
```
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation
```
````

## Anti-Patterns to Avoid

### Avoid Windows-Style Paths

Always use forward slashes in file paths, even on Windows:

- ✓ **Good**: `scripts/helper.py`, `reference/guide.md`
- ✗ **Avoid**: `scripts\helper.py`, `reference\guide.md`

### Avoid Offering Too Many Options

Don't present multiple approaches unless necessary:

````markdown
**Bad example: Too many choices**:
"You can use pypdf, or pdfplumber, or PyMuPDF, or pdf2image, or..."

**Good example: Provide a default**:
"Use pdfplumber for text extraction:
```python
import pdfplumber
```

For scanned PDFs requiring OCR, use pdf2image with pytesseract instead."
````

## Evaluation and Iteration

### Build Evaluations First

**Create evaluations BEFORE writing extensive documentation.** This ensures your skill solves real problems rather than documenting imagined ones.

**Evaluation-driven development:**
1. **Identify gaps**: Run agent on representative tasks without a skill. Document specific failures or missing context
2. **Create evaluations**: Build three scenarios that test these gaps
3. **Establish baseline**: Measure agent's performance without the skill
4. **Write minimal instructions**: Create just enough content to address the gaps and pass evaluations
5. **Iterate**: Execute evaluations, compare against baseline, and refine

### Develop Skills Iteratively

Work with one instance of the agent ("Agent A") to create a skill that will be used by other instances ("Agent B"). Agent A helps you design and refine instructions, while Agent B tests them in real tasks.

**Creating a new skill:**

1. **Complete a task without a skill**: Work through a problem with Agent A using normal prompting. Notice what information you repeatedly provide.

2. **Identify the reusable pattern**: After completing the task, identify what context you provided that would be useful for similar future tasks.

3. **Ask Agent A to create a skill**: "Create a skill that captures this pattern we just used. Include the schemas, naming conventions, and filtering rules."

4. **Review for conciseness**: Check that Agent A hasn't added unnecessary explanations.

5. **Improve information architecture**: Ask Agent A to organize the content more effectively.

6. **Test on similar tasks**: Use the skill with Agent B on related use cases.

7. **Iterate based on observation**: If Agent B struggles or misses something, return to Agent A with specifics.

## Checklist for Effective Skills

Before sharing a skill, verify:

### Core Quality
- [ ] Description is specific and includes key terms
- [ ] Description includes both what the skill does and when to use it
- [ ] SKILL.md body is under 200 lines (ideally <500 for optimal performance)
- [ ] Additional details are in separate files (if needed)
- [ ] No time-sensitive information (or in "old patterns" section)
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps

### Code and Scripts
- [ ] Scripts solve problems rather than punt to agent
- [ ] Error handling is explicit and helpful
- [ ] No "voodoo constants" (all values justified)
- [ ] Required packages listed in instructions
- [ ] Scripts have clear documentation
- [ ] No Windows-style paths (all forward slashes)
- [ ] Validation/verification steps for critical operations
- [ ] Feedback loops included for quality-critical tasks

### Testing
- [ ] At least three evaluations created
- [ ] Tested with different models (if applicable)
- [ ] Tested with real usage scenarios
- [ ] Team feedback incorporated (if applicable)
