Reusable elements definition must include:

- Where is element used. When is it not used.
- Code examples how to build, or use. Including where located in workspace, or code for component itself if small.
- How to use the element. If parametrizable, ultra compact list showing props and how to use.
- Aware of remotion guidelines (only animate using remotion spec).

## Example

```md
# When to use

- Watermark: Bottom-right corner, 50px to border, 60px width & height, 50% opacity, use logo only
- Outro and Intro slides: Use full logo with workmark. Full opacity.

# Source

- In workspace monorepo package `assets` in `assets/logos/logo.tsx`

## Example

```tsx
import{LogoCombo}from"assets";
<LogoCombo className="h-10"/>
```

## Parametrization

- `className`: tailwind style config
- `variant`: `monochrome` or `default`. Use monochrome for small watermarks.

```


## Images

Gradients, reused stock footage etc. can be placed into elements folder and referenced by an markdown file.
