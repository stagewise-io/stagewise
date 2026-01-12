# @stagewise/tailwindcss-color-modifiers

A Tailwind CSS plugin that lets you **adjust OKLCH color channels directly in class names** using modern CSS *relative colors*.

This enables expressive utilities like:

```html
bg-green-300/l20          <!-- increase lightness (add) -->
bg-green-300/l-20         <!-- decrease lightness (subtract) -->
bg-blue-500/lx1.2         <!-- 20% lighter (multiply) -->
bg-red-500/cd2            <!-- half saturation (divide) -->
```

## Features

- Modify lightness (l), chroma (c), hue (h), and alpha (a)
- Four operations: add (+), subtract (-), multiply (*), divide (/)
- Works on existing Tailwind color utilities
- Uses CSS `oklch(from …)` relative colors
- Supports multiple channel adjustments in one modifier
- Silent failure by default (optional warnings)
- Chrome / Electron friendly

## Installation

```bash
pnpm add -D @stagewise/tailwindcss-color-modifiers
# or
npm install -D @stagewise/tailwindcss-color-modifiers
# or
yarn add -D @stagewise/tailwindcss-color-modifiers
```

## Usage

### Tailwind CSS v4

Tailwind v4 is CSS-first but supports v3-style JavaScript plugins via a compatibility layer.

**Option A: CSS-first (no options needed)**

Use the `@plugin` directive directly in your CSS:

```css
@import "tailwindcss";
@plugin "@stagewise/tailwindcss-color-modifiers";
```

**Option B: With plugin options (like `{ warn: true }`)**

Use the `@config` directive to load a legacy config file:

```css
@import "tailwindcss";
@config "./tailwind.config.js";
```

```js
// tailwind.config.js
import colorModifiers from '@stagewise/tailwindcss-color-modifiers';

export default {
  plugins: [colorModifiers({ warn: true })],
};
```

> **Modifier syntax in Tailwind v4:**
>
> | Syntax | Meaning | Notes |
> |--------|---------|-------|
> | `/50` | Opacity 50% | Tailwind's built-in (unchanged) |
> | `/l20` | Lightness +0.20 | **Add** - omitted op = add |
> | `/l-20` | Lightness -0.20 | **Subtract** - minus sign |
> | `/lx1.2` | Lightness × 1.2 | **Multiply** - `x` = times |
> | `/ld2` | Lightness ÷ 2 | **Divide** - `d` = divide |
> | `/[l*1.2]` | Lightness × 1.2 | Bracket syntax for `*` |
> | `/[l/2]` | Lightness ÷ 2 | Bracket syntax for `/` |
>
> ```html
> <!-- Add/subtract (values auto-scaled: 20 → 0.20) -->
> bg-green-300/l20         <!-- L + 0.20 -->
> bg-green-300/l-20        <!-- L - 0.20 -->
>
> <!-- Multiply/divide (values NOT scaled: 1.2 stays 1.2) -->
> bg-blue-500/lx1.2        <!-- L * 1.2 (20% lighter) -->
> bg-red-500/cd2           <!-- C / 2 (half saturation) -->
>
> <!-- Bracket syntax for explicit symbols -->
> bg-green-300/[l+20]      <!-- same as /l20 -->
> bg-blue-500/[l*1.2]      <!-- same as /lx1.2 -->
> ```

### Tailwind CSS v3

Add the plugin to your Tailwind config:

```ts
// tailwind.config.ts
import colorModifiers from '@stagewise/tailwindcss-color-modifiers';

export default {
  plugins: [
    colorModifiers({ warn: true }), // warn is optional
  ],
};
```

## Syntax

Modifiers are appended after `/` and consist of one or more operations:

```
<channel><operation><number>
```

### Channels

- `l` – lightness
- `c` – chroma
- `h` – hue (degrees)
- `a` – alpha

Uppercase variants (`L` `C` `H` `A`) are also supported.

### Operations

| Operation | Symbol | Letter | Meaning | Scaling |
|-----------|--------|--------|---------|---------|
| Add | `+` | `p` | Increase value | Auto-scaled |
| Subtract | `-` | `m` | Decrease value | Auto-scaled |
| Multiply | `*` | `x` | Relative scaling | **NOT scaled** |
| Divide | `/` | `d` | Relative scaling | **NOT scaled** |

- When operation is omitted, defaults to **add** (`+`)
- Symbols `+`, `*`, `/` require bracket syntax: `/[l+20]`, `/[l*1.2]`
- Letters `p`, `m`, `x`, `d` work without brackets: `/lp20`, `/lx1.2`

### Examples

```html
<!-- Add/subtract (auto-scaled: integers ÷ 100) -->
bg-green-300/l2            <!-- calc(L + 0.02) -->
bg-green-300/l-2           <!-- calc(L - 0.02) -->
bg-green-300/l0.02         <!-- calc(L + 0.02) literal -->

<!-- Multiply/divide (NOT scaled: use raw values) -->
bg-blue-500/lx1.2          <!-- calc(L * 1.2) - 20% brighter -->
bg-red-500/ld2             <!-- calc(L / 2) - half lightness -->
bg-gray-500/cx0.5          <!-- calc(C * 0.5) - half saturation -->

<!-- Letter alternatives -->
bg-green-300/lp2           <!-- calc(L + 0.02) - p = plus -->
bg-green-300/lm2           <!-- calc(L - 0.02) - m = minus -->

<!-- Bracket syntax (for symbols) -->
bg-green-300/[l+2]         <!-- calc(L + 0.02) -->
bg-blue-500/[l*1.2]        <!-- calc(L * 1.2) -->
bg-red-500/[c/2]           <!-- calc(C / 2) -->

<!-- Other channels -->
text-zinc-700/c-0.01       <!-- chroma subtract -->
bg-indigo-500/h30          <!-- hue + 30deg -->
bg-black/a-0.2             <!-- alpha subtract -->
bg-white/ax0.8             <!-- alpha * 0.8 -->
```

### Multiple operations

Operations can be chained:

```html
bg-blue-500/l20cx0.5       <!-- add lightness, halve chroma -->
bg-blue-500/lp2cm0.04hp10  <!-- using letter syntax -->
```

Optional separators for readability:

```html
bg-blue-500/l20_cx0.5_h10
bg-blue-500/l20,cx0.5,h10
```

### Scaling rules

**Add/subtract** (for l, c, a channels):

| Input | Interpretation |
|-------|----------------|
| Integer | Divided by 100: `l2` → `+0.02` |
| Decimal | Literal: `l0.02` → `+0.02` |
| With `%` | Divided by 100: `[l2%]` → `+0.02` (brackets required) |

**Multiply/divide** (all channels):

| Input | Interpretation |
|-------|----------------|
| Any number | Used as-is: `lx2` → `* 2`, `ld10` → `/ 10` |
| With `%` | **Not allowed** (rejected) |

> **Note:** The `%` character requires bracket syntax in Tailwind v4.
> Since integers are already auto-scaled for add/subtract, just use `/a10` instead of `/[a10%]`.

Hue (`h`) is always interpreted as degrees and is never scaled for add/subtract.

## Supported utilities

| Utility | CSS Property |
|---------|--------------|
| `bg-*` | `background-color` |
| `text-*` | `color` |
| `border-*` | `border-color` |
| `ring-*` | `--tw-ring-color` |
| `ring-offset-*` | `--tw-ring-offset-color` |
| `outline-*` | `outline-color` |
| `shadow-*` | `--tw-shadow-color` |
| `decoration-*` | `text-decoration-color` |
| `caret-*` | `caret-color` |
| `accent-*` | `accent-color` |
| `fill-*` | `fill` |
| `stroke-*` | `stroke` |
| `from-*`, `via-*`, `to-*` | gradient stop colors |

## Error handling

- Invalid modifiers are ignored silently
- Tailwind's default behavior (e.g. `/50` opacity) remains intact
- Enable warnings with:

```ts
colorModifiers({ warn: true })
```

## Browser support

Requires support for CSS relative colors (`oklch(from …)`):

- ✅ Chrome / Chromium
- ✅ Electron
- ⚠️ Firefox (in progress)

## License

MIT
