# stagewise style system

This is the canonical guide for building and designing UIs for stagewise. It covers all you need to know.

## Table of Contents

- [Why we only use OKLCH](#first-things-first)
- [File Structure](#file-structure)
  - [What stage-ui contains](#stage-ui)
  - [How to use stage-ui](#how-to-use-stage-ui)
  - [Scripts and generators you need to know](#script-and-generators)
- [The base: Our color palette](#color-palette)
  - [Base colors (95% of the app)](#base-colors)
  - [Primary (4% of the app)](#primary)
  - [Semantics (1% of the app)](#semantics)
- [Tokens](#theme-tokens)
  - [List of all theme tokens](#list-of-tokens)
  - [How do I pick a background and shadow](#backgrounds)
  - [What's the right text color?](#text-color)
  - [How to set borders, hover- and active-states](#borders)
- [Color Modifiers](#color-modifiers)
  - [How to use a color modifier](#how-to-use-color-modifier)
- [Code Syntax Highlighting](#code-syntax-highlighting)
  - [How Syntax Themes Work](#how-syntax-themes-work)
- [Storybook](#storybook)
  - [How to start storybook](#how-to-start-storybook)

---

## Why we only use OKLCH {#first-things-first}

OKLCH is godsent - it lets us define consistent color palettes with ease. Our color palettes are built by keeping HUE consistent (--H) and walking down/up the ramp with lightness and chroma. 
Read [this HN article](https://news.ycombinator.com/item?id=45010876) for more information.

---

## File Structure

### What stage-ui contains {#stage-ui}
All our **css definitions** live inside [`src/styles/`](./src/styles/). 
**Components** live inside [`src/components/`](./src/components/).
Other locations (e.g. storybook, libs, etc.) are not that important.

### How to use stage-ui
To use the styles of stage-ui, simply use an import of the [`index.css`](./src/styles/index.css) (e.g. `@import "../../../../../packages/stage-ui/src/styles/index.css";`).
Same for the components - but with the use of ts aliases (e.g. `import { Button } from '@stagewise/stage-ui/components/button';`). `stage-ui`-code will not be built/ bundled.

### Scripts and generators you need to know {#script-and-generators}
Some commands for **electron** cannot use css vars and use 'hardcoded' hex colors instead (e.g. `new BaseWindow()`).
The themes for our code highlighting library **shiki** are located inside `.json`-files with hard-coded hex colors as well (TextMate definitions, just like vscode's themes).

To keep all of our color definitions in one place (our palette), we use custom scripts to extract and convert the OKLCH-definitions from our palette into the `.ts`-files with hex color definitions for electron and `.json` theme files for shiki.

**To generate electron background colors based on our palette once, run:**
```bash
pnpm --filter @stagewise/stage-ui generate:theme-colors
```
**To generate a TextMate json for shiki based on our palette once, run:**
```bash
pnpm --filter @stagewise/stage-ui generate:themes
```
**Run the dev server to regenerate both on changes in our palette:**
```bash
pnpm --filter @stagewise/stage-ui dev:themes
```

---

## The base: Our color palette {#color-palette}

### Base colors (--color-base-*) (95% of the app) {#base-colors}

Base colors use our primary hue (`--H`) with **low chroma** (nearly grayscale, but subtly tinted). Used for >95% of the app: backgrounds, borders, text, etc.
They are defined in 50s steps from 50 to 950 (`--color-base-50` - `--color-base-950`).

### Primary (--color-primary-*) (4% of the app) {#primary}

Primary colors use the same hue (`--H`) but with **high chroma** (saturated/vibrant). Used for CTAs and highlights (links, primary buttons, badges).
They are defined in 50s steps from 50 to 950 (`--color-primary-50` - `--color-primary-950`).

### Semantics (1% of the app) {#semantics}

Semantic colors (success, error, warning, info) have their own hue, but share similar lightness and chroma for visual consistency.
The raw palette defines light/dark variants (`--color-*-background-light`, `--color-*-background-dark`), which are then mapped to auto-switching theme tokens (see [Semantic colors](#semantic-colors) in the Tokens section).

---

## Tokens {#theme-tokens}

### List of all theme tokens {#list-of-tokens}

Theme tokens are defined in [`theme.css`](./src/styles/theme.css) and automatically switch between light/dark mode.

#### Backgrounds

| Token | Description |
|-------|-------------|
| `--color-app-background` | Outermost app background (behind everything) |
| `--color-background` | Main content background (cards, panels) |
| `--color-surface-1` | First elevation level above background |
| `--color-surface-2` | Second elevation level (nested elements) |
| `--color-surface-3` | Third elevation level (deeply nested) |
| `--color-surface-tinted` | Primary-tinted surface for highlights |
| `--color-overlay` | Modal/dialog backdrop overlay |

#### Text

| Token | Description |
|-------|-------------|
| `--color-foreground` | Primary readable text |
| `--color-muted-foreground` | Secondary/less important text |
| `--color-subtle-foreground` | Hints, placeholders, disabled text |
| `--color-sidebar-foreground` | Sidebar-only secondary/label text. Between `subtle` and `muted` (leans muted) for legibility on the blurred sidebar surface |
| `--color-primary-foreground` | Accent text (links, highlights) |
| `--color-solid-foreground` | Text on solid/primary backgrounds |

#### Borders

| Token | Description |
|-------|-------------|
| `--color-border` | Regular borders |
| `--color-border-subtle` | Subtle/lighter borders |

#### Primary

| Token | Description |
|-------|-------------|
| `--color-primary-solid` | Solid primary background (primary buttons) |

#### Semantic colors

| Token | Description |
|-------|-------------|
| `--color-(success\|error\|warning\|info)-background` | Soft background for banners, alerts |
| `--color-(success\|error\|warning\|info)-foreground` | Text color on base backgrounds |
| `--color-(success\|error\|warning\|info)-solid` | Solid background for buttons, badges |

### How do I pick a background and shadow {#backgrounds}
In **light mode**, backgrounds are simply `bg-background`. Depth is created by using shadows.
In **dark mode**, elements receive a `bg-background` or `bg-surface-(1|2|3)`, depending on their elevation and their parent:
    - An elevated card that sits on top of a div with `bg-background` will receive `bg-surface-1`. 
    - A button inside a card that has `bg-surface-1` will receive `bg-surface-2` to look even closer than the card. 

### What's the right text color? {#text-color}
Use `text-foreground` for readable text, `text-muted-foreground` for less important text, and `text-subtle-foreground` for hints or disabled states. See the [Text tokens table](#text) above for all options. 

### How to set borders, hover- and active-states {#borders}
We use tailwind utilities to derive borders, hover- and active-states based on an element's background color. 
Based on light/ dark mode and the bg color of an element, the utilities will darken/ lighten the border/bg.

**Important:** For those utilities to work, the element needs to have a background color defined.

**Borders**:
    - `(border|ring)-derived-subtle` (used for lighter/subtle borders and rings)
    - `(border|ring)-derived` (regular borders)
    - `(border|ring)-derived-strong` (stronger borders, seldomly needed)

**States**:
    - `hover:(bg|text)-hover-derived`
    - `active:(bg|text)-active-derived`

**Explicitly lighten/darken the bg/border (ignores dark/light mode, seldomly needed):**
    - `(border|ring|text|bg)-derived-lighter` (will make the border/ring/.. lighter than the bg, regardless of light/ dark mode - used for colors that look similar in light and dark mode, e.g. primary)
    - `(border|ring|text|bg)-derived-lighter-subtle` (...)
    - `bg-derived-darker` (same as -lighter, but makes it darker)
    - `bg-derived-darker-subtle` (...)

---

## Color Modifiers {#color-modifiers}

### How to use a color modifier (used rarely) {#how-to-use-color-modifier}

We created the tailwind plugin `@stagewise/tailwindcss-color-modifiers` which lets us use *any* defined color with modified lightness/chroma/hue/alpha channels. 
This is huge since it removes workarounds like using `text-foreground/60` for a subtle text color and lets us use **truly lighter** colors instead.

Examples:
- `bg-base-950/l3_c4_h3` -> Will apply color-base 950 but with 0.03 higher lightness, 0.04 higher chroma and 3° higher hue (same as `bg-base-950/l0.03/c0.04/h3`)
- `bg-base-50/-l2_-c5_-h2` -> Will apply color-base 50 but with 0.02 lower lightness, 0.05 lower chroma and 2° lower hue (same as `bg-base-50/-l0.02/-c0.05/-h2`) 

Read the [tailwindcss-color-modifiers README](../tailwindcss-color-modifiers/README.md) for the whole docs.

---

## Code Syntax Highlighting

### How Syntax Themes Work

We use our own css colors to create a TextMate code highlighting theme to create a consistent palette in the browser. The tokens are defined as `--color-syntax-*` in [`palette.css`](./src/styles/palette.css) and mapped in [`code-block-syntax.css`](./src/styles/code-block-syntax.css).
To generate a theme from the style definitions, check the scripts section above.

---

## Storybook {#storybook}

### How to start storybook {#how-to-start-storybook}

We use storybook to preview color definitions, components and even agent UI. 
Start it via `pnpm --filter stagewise storybook`.