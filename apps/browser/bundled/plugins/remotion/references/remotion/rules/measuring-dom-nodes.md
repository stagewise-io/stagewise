Remotion puts `scale()` on video container. That changes `getBoundingClientRect()` values. Use `useCurrentScale()` for correct measurement.

## Measuring element dimensions

```tsx
import{useCurrentScale}from"remotion";import{useRef,useEffect,useState}from"react";export const MyComponent=()=>{const ref=useRef<HTMLDivElement>(null);const scale=useCurrentScale();const[dimensions,setDimensions]=useState({width:0,height:0});useEffect(()=>{if(!ref.current)return;const rect=ref.current.getBoundingClientRect();setDimensions({width:rect.width/scale,height:rect.height/scale})},[scale]);return<div ref={ref}>Content to measure</div>;};
```
