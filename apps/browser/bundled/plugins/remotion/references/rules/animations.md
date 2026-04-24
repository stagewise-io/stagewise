All animation must use `useCurrentFrame()`.  
Write timing in seconds, then multiply by `fps` from `useVideoConfig()`.

For eased motion, prefer `interpolate` with explicit frame ranges + easing. Use `Easing.bezier` most. It matches CSS `cubic-bezier`, so web timing can carry over. See `./timing.md`.

```tsx
import{useCurrentFrame,Easing}from"remotion";
export const FadeIn=()=>{const frame=useCurrentFrame();const{fps}=useVideoConfig();
const opacity=interpolate(frame,[0,2*fps],[0,1],{extrapolateRight:"clamp",extrapolateLeft:"clamp",easing:Easing.bezier(0.16,1,0.3,1)});
return <div style={{opacity}}>Hello World!</div>;};
```

CSS transitions, CSS animations forbidden. Bad render.  
Tailwind animation class names forbidden. Bad render.
