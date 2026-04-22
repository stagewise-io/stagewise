Styleguide tell agent how video must look.

Styleguide MUST be skill.

## File structure

```text
my-video-styleguide
├─ layouts
│  ├─ hero-slide.md
│  ├─ person-with-name-overlay.md
│  └─ video-demo-slide-text-left.md
├─ storyboard-templates
│  ├─ feature-launch.md
│  └─ extended-product-demo.md
├─ elements
│  ├─ logo.md
│  └─ mascot.md
├─ DESIGN.md
└─ SKILL.md
```

Meaning:

- `layouts`: reusable scene layouts
- `storyboard-templates`: reusable video flow patterns
- `elements`: reusable video parts like logo, mascot, overlays
- `DESIGN.md`: design system. optional if workspace root already has right one
- `SKILL.md`: overview skill, tells when to read refs

## Writing style

Guide must be compressed.

Use:

- facts
- short phrases
- numbers
- repeatable wording
- tiny examples

Avoid long prose.

## `SKILL.md`

Must be valid agent skill file.

Need:

1. YAML frontmatter
   - clear name
   - name should include style + `video-styleguide`
   - description must say: use ONLY for making Remotion videos in this style
2. main body
   - reference `DESIGN.md` in same folder or workspace root
   - list layouts and when each used
   - list storyboard templates and what each good for
   - list reusable elements and when each matters

Reference files in tables.

Name files by job, not vague words.

Bad:

```md
| `./storyboard-templates/feature-launch.md` | Logo component explainer. Use throughout video. |
```

Good:

```md
| `./elements/logo.md` | Watermarks, intro/outro, demos |
```

### Example

```md
---
name: mycompany-video-styleguide
description: mycompany video styleguide for making videos with Remotion.
---

`DESIGN.md` is in workspace root.

## `./layouts`

- `logo-slide.md`: single logo slide. outro / last slide.
- `person-with-name-overlay.md`: camera shot with name + role overlay.
- `video-demo-slide-text-left.md`: product demo with short explainer on side.

## `./storyboard-templates`

- `feature-launch.md`: short feature demo, 20-40s, social media.
- `extended-product-demo.md`: longer demo with explainers and camera content.

## `./elements`

- `logo.md`: watermark, intro/outro, demo components.
- `mascot.md`: floating mascot in product demos.
```

## `DESIGN.md`

- optional if open workspace already has right file
- ask user which `DESIGN.md` to use
- if workspace already has one, suggest reusing it
- if none exists, suggest making new one
- if making new one, MUST follow `./howto-design.md`
- ask user where design comes from:
  - codebase in this workspace
  - codebase in another workspace
  - opened tab content
  - reference images

## Layouts

Layouts define how one Remotion sequence looks:

- content
- arrangement
- in/out transitions

Rules:

- keep in `./layouts`
- reusable layout gets own file
- one-off case can stay local if truly one-off
- New/Updat existing: ALWAYS follow `./howto-layouts.md`

## Storyboard templates

Storyboard template defines sequence of layouts/scenes in one video.

May have:

- mandatory sections
- optional sections
- repeatable sections

Rules:

- keep in `./storyboard-templates`
- New/Update existing: ALWAYS follow `./howto-storyboard-templates.md`

## Elements

Elements define reusable visual parts in system.

May:

- describe element inline
- reference existing component code in workspace

Rules:

- keep in `./elements`
- ALWAYS follow `./howto-elements.md`

## How to build new style guide

1. Ask user for design source
   - if no reference exists: design with user
   - use `./design-inspirations.md` for inspiration
   - define system together, iteratively
2. Create `DESIGN.md`
   - extract relevant visual rules from reference
   - put file in styleguide folder
   - follow `./howto-design.md`
3. Fill `layouts`, `storyboard-templates`, `elements` over time
   - build video
   - watch patterns emerge
   - store reusable parts in styleguide
