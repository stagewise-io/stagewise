Drive motion with `interpolate()` over explicit frame range. For custom timing, use **`Easing.bezier`**. Four params match CSS `cubic-bezier(x1,y1,x2,y2)`.

Simple linear interpolation: ```import{interpolate}from"remotion";const opacity=interpolate(frame,[0,100],[0,1]);```

By default, values not clamped. Can go outside `[0,1]`. Clamp like this: ```const opacity=interpolate(frame,[0,100],[0,1],{extrapolateRight:"clamp",extrapolateLeft:"clamp"});```

For Bézier easing: Use `Easing.bezier(x1,y1,x2,y2)` inside `interpolate` options. Same idea as CSS animations/transitions. Good when reusing web timing or design specs.

```import{interpolate,Easing}from"remotion";const opacity=interpolate(frame,[0,60],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:"clamp",extrapolateRight:"clamp"});```

### Examples (copy-paste curves)

**1. Crisp UI entrance (strong ease-out, no overshoot)** — slows nicely into rest value. Like many system deceleration curves.
```const enter=interpolate(frame,[0,45],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:"clamp",extrapolateRight:"clamp"});```

**2. Editorial / slow fade (balanced ease-in-out)** — symmetric accel + decel. Good for hold-friendly move.
```const progress=interpolate(frame,[0,90],[0,1],{easing:Easing.bezier(0.45,0,0.55,1),extrapolateLeft:"clamp",extrapolateRight:"clamp"})```

**3. Playful overshoot (control point y > 1)** — goes past target a bit, then settles. Use sparingly.
```const pop=interpolate(frame,[0,30],[0,1],{easing:Easing.bezier(0.34,1.56,0.64,1),extrapolateLeft:"clamp",extrapolateRight:"clamp"});```

## Preset easings (`Easing.in` / `Easing.out` / named curves)

Can add easing to `interpolate()` without custom cubic.

```import{interpolate,Easing}from"remotion";const value1=interpolate(frame,[0,100],[0,1],{easing: Easing.inOut(Easing.cubic),extrapolateLeft:"clamp",extrapolateRight:"clamp"});```

Default easing is `Easing.linear`.  
Convexities:

- `Easing.in` — starts slow, accelerates
- `Easing.out` — starts fast, slows down
- `Easing.inOut`

Named curves, most linear → most curved:

- `Easing.quad`
- `Easing.cubic` good default if no custom cubic needed
- `Easing.sin`
- `Easing.exp`
- `Easing.circle`

### Easing direction for enter/exit animations

Use `Easing.out` for enter. Starts fast, settles in. Use `Easing.in` for exit. Starts slow, accelerates away. Feels natural. If design gives specific curve, prefer one `Easing.bezier(...)` over stacked presets.

## Composing interpolations

If many properties share same timing, do not duplicate full interpolation for each one. Make one normalized progress `0-1`, then derive all properties from it.

```tsx
const slideIn=interpolate(frame,[slideInStart,slideInStart+slideInDuration],[0,1],{easing:Easing.bezier(0.22,1,0.36,1),extrapolateLeft:"clamp",extrapolateRight:"clamp"});
const slideOut=interpolate(frame,[slideOutStart,slideOutStart+slideOutDuration],[0,1],{easing:Easing.in(Easing.cubic),extrapolateLeft:"clamp",extrapolateRight:"clamp"});
const progress=slideIn-slideOut;const overlayX=interpolate(progress,[0,1],[100,0]);const videoX=interpolate(progress,[0,1],[0,-20]);const opacity=interpolate(progress,[0,1],[0,1]);
```

Key idea: separate **timing** from **mapping**.
