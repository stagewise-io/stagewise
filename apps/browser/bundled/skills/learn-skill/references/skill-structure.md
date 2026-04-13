# Skill Structure

## SKILL.md Requirements

**File name:** `SKILL.md` (uppercase)
**File size:** Under 200 lines

### YAML Frontmatter

```yaml
---
name: skill-name
description: Short description of what this skill does and when to use it.
---
```

**Metadata Quality:** The `name` and `description` determine when the agent will use the skill. Be specific about what the skill does and when to use it.

### Writing Style

- Use imperative/infinitive form (verb-first instructions)
- Use objective, instructional language
- Example: "To accomplish X, do Y" rather than "You should do X"
- **No meta phrasing**: avoid “This skill tells you…”, “In this skill…”, “You can use this skill…”. Start with the action: “Do X, then Y”.
- **No description duplication**: the SKILL.md body must not restate the frontmatter `description` (verbatim or near-verbatim). Frontmatter is the discovery blurb; the body contains triggers/steps/constraints.

### Content Organization

1. Purpose of the skill (few sentences)
2. When should the skill be used
3. How to use the skill (reference bundled resources)
4. References section pointing to `references/` files — **required whenever reference files exist**

## Bundled Resources

### Scripts (`scripts/`)

- Executable code for deterministic reliability
- Prefer Node.js or Python over Bash (better Windows support)
- Include `requirements.txt` for Python scripts
- Respect `.env` files in order: `process.env` > `~/.agent/skills/${SKILL}/.env` > `~/.agent/skills/.env` > `~/.agent/.env` (adjust paths based on agent harness)
- Create `.env.example` file
- Always write tests

### References (`references/`)

- Documentation loaded as needed
- Keep files <200 lines when possible
- Can reference other markdown files or scripts
- Sacrifice grammar for concision when needed
- Avoid duplication with SKILL.md

**Every reference file must be listed in SKILL.md's `## References` section** with 1–2 sentences: what the file contains and when the agent should load it. An unlisted reference file is invisible to the agent — it will never know to load it. The description must be specific enough that the agent can decide whether to load the file without opening it.

### Assets (`assets/`)

- Files not loaded into context
- Used within output agent produces
- Examples: templates, images, icons, fonts, boilerplate code
