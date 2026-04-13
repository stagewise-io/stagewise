# Progressive Disclosure

The 200-line rule matters, it's the difference between fast navigation and context sludge.

## Core Principle

Progressive disclosure isn't optional. Every skill over 200 lines should be refactored. No exceptions. If you can't fit the core instructions in 200 lines, you're putting too much in the entry point.

**Note**: While 200 lines is the strict target, skills up to 500 lines can still perform well. However, splitting content into references is always preferred for optimal performance.

## References are First-Class Citizens

### Structure

- **SKILL.md**: High-level overview, when to use, core principles (<200 lines)
- **references/**: Detailed documentation loaded on-demand
- Each reference file should also be <200 lines when possible

### Example

Instead of a 1000-line SKILL.md:
- SKILL.md: Core principles, architecture overview (150 lines)
- references/components.md: Component patterns (150 lines)
- references/routing.md: Routing patterns (100 lines)
- references/forms.md: Form handling (120 lines)
