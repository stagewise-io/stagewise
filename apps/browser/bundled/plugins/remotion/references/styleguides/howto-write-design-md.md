DESIGN.md has 2 layers:

1. YAML front matter at top between `---`
   - machine tokens
   - exact values agent can copy
2. markdown body under it
   - human reasoning
   - tells why tokens exist, how to use

Rule: TOKENS = TRUTH. Prose = intent.

DESIGN.md = machine tokens + human design reasoning.

## What file must do

File must answer 3 things fast:

1. what values to use
2. why values exist
3. how design should feel in practice

## Canonical shape

```md
---
version: alpha
name: System Name
description: Short summary
colors:
  primary: '#111111'
  secondary: '#666666'
  accent: '#D9482B'
  surface: '#F6F3EE'
typography:
  h1:
    fontFamily: Inter
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.05
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '#FFFFFF'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 12px
---

## Overview

Short brand read.

## Colors

Explain color roles.

## Typography

Explain hierarchy. Include links to remote or in-repo location of font.

## Layout

Explain spacing rhythm.

## Elevation & Depth

Explain layering.

## Shapes

Explain corner language.

## Components

Explain special component rules.

## Do's and Don'ts

State hard rules.
```

## Front matter

Good file usually has:

- `name`
- `colors`
- `typography`
- body sections

Common top keys:

```yaml
version: <string> # optional
name: <string>
description: <string> # optional
colors:
  <token-name>: <Color>
typography:
  <token-name>: <Typography>
rounded:
  <scale-level>: <Dimension>
spacing:
  <scale-level>: <Dimension | number>
components:
  <component-name>:
    <property>: <string | token reference>
```

Valid value types:

- color: HEX string
- dimension: px, rem, em
- token ref: `{colors.primary}`
- typography object with keys like:
  - `fontFamily`
  - `fontSize`
  - `fontWeight`
  - `lineHeight`
  - `letterSpacing`
  - `fontFeature`
  - `fontVariation`

## Body section order

If section exists, keep this order:

1. `## Overview`
2. `## Colors`
3. `## Typography`
4. `## Layout`
5. `## Elevation & Depth`
6. `## Shapes`
7. `## Components`
8. `## Do's and Don'ts`

Known aliases:

- `Overview` = `Brand & Style`
- `Layout` = `Layout & Spacing`
- `Elevation & Depth` = `Elevation`

DO NOT duplicate same heading. That error.

## How to write sections

### Overview

Tell whole visual feel in few lines.

Include:

- emotional tone
- visual metaphor
- product personality
- what should feel loud or quiet

Bad: "Modern clean UI."

Good: "Quiet editorial UI. Deep ink type, warm paper surface, one clay accent for action."

### Colors

Do not only dump hex.

For important colors, say:

- where used
- how strong
- what should not use it
- whether it is text, surface, border, accent, danger, or chrome

For gradients, include:

- directions
- step positions and colors
- type

### Typography

Map type tokens to jobs.

Examples:

- hero
- headline
- body
- label
- caption
- code

Explain hierarchy, weight, case, spacing, density.

### Layout

Explain rhythm, not only numbers.

Include:

- spacing cadence
- container feel
- dense or airy
- symmetry or asymmetry
- grid rules if important

### Elevation & Depth

Say if system flat, layered, tactile, paper, glass, brutal.

Include:

- shadows
- borders
- overlays
- card depth
- hover or pressed depth shift

### Shapes

Tell corner and geometry language.

Include:

- rounding scale
- pills or rects
- hard or soft edges
- when to use each

### Transitions & Animations

Use of transition and animations in components, slides, layouts.

Include:

- duration
- easing curves
- loop behavior
- keyframes
- when to use each

### Components

Use when base tokens not enough.

Best for:

- buttons
- inputs
- cards
- badges
- nav
- modals
- callouts

### Do's and Don'ts

Best guardrail section.

Write direct rules.

Examples:

- DO keep accent rare and meaningful.
- DO use large type with generous line height.
- DON'T use many saturated accents in one view.
- DON'T round everything if system meant to feel strict.

## Component token rules

Components map name to sub-properties.

```yaml
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.label-md}'
    rounded: '{rounded.md}'
    padding: 12px
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
```

Known component properties:

- `backgroundColor`
- `textColor`
- `typography`
- `rounded`
- `padding`
- `size`
- `height`
- `width`

State variants like hover or active: use separate entries.

## Writing rules

- ALWAYS write BOTH tokens and prose
- use exact tokens for reusable values (double check)
- use prose for meaning, intent, constraints
- name tokens by role
- keep names stable
- make body opinionated
- explain what matters most visually

## Naming

Good: `primary`, `surface`, `text-muted`, `button-primary`, `label-caps`
Weak: `blue-1`, `big-text`, `roundy`, `nice-button`

Reason: role names help agent infer usage fast.

## Generate from existing source

- Extract all standard components if codebase is source. Extract more if user requests.
- Always use RGB. Convert from OKLCH or HSL to RGB.
- If extracting from existing website:
  - Make screenshots and analyze mood, layout, color composition
  - Extract variables, palette colors, definitions from CSS or element style defs via CDP
  - Download example imagery, reference gradients, reusable assets, etc. and store in `elements`
  - Search for downloadable brand kit assets, store in `elements` alongside definitions how to use.
    - ALWAYS PREFER brand kit assets over manually generating gradients, logos, etc.
