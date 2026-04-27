Use `<Sequence>` to delay when element appears in timeline.

```tsx
import{Sequence}from"remotion";const{fps}=useVideoConfig();
<Sequence from={1*fps} durationInFrames={2*fps} premountFor={1*fps}><Title/></Sequence><Sequence from={2*fps} durationInFrames={2*fps} premountFor={1*fps}><Subtitle/></Sequence>;
```

Default wraps child in absolute fill element.  
If no wrap wanted, use `layout` prop.

```tsx
<Sequence layout="none"><Title/></Sequence>
```

## Premounting

Loads component before play time.  
Always premount `<Sequence>`.

```tsx
<Sequence premountFor={1*fps}><Title/></Sequence>
```

## Series

Use `<Series>` when items play one after another with no overlap.

```tsx
import { Series } from "remotion";
<Series><Series.Sequence durationInFrames={45}><Intro/></Series.Sequence><Series.Sequence durationInFrames={60}><MainContent/></Series.Sequence><Series.Sequence durationInFrames={30}><Outro/></Series.Sequence></Series>;
```

Like `<Sequence>`, `<Series.Sequence>` wraps in absolute fill by default. Use `layout="none"` to stop that.

### Series with overlaps

Use negative `offset` for overlap.

```tsx
<Series><Series.Sequence durationInFrames={60}><SceneA/></Series.Sequence><Series.Sequence offset={-15} durationInFrames={60}><SceneB/></Series.Sequence></Series>
```

## Frame References Inside Sequences

Inside `<Sequence>`, `useCurrentFrame()` returns local frame starting at `0`.

```tsx
<Sequence from={60} durationInFrames={30}><MyComponent/>{/*Inside MyComponent, useCurrentFrame() returns 0-29, not 60-89*/}</Sequence>
```

## Nested Sequences

Can nest sequences for more complex timing.

```tsx
<Sequence from={0} durationInFrames={120}><Background/><Sequence from={15} durationInFrames={90} layout="none"><Title/></Sequence><Sequence from={45} durationInFrames={60} layout="none"><Subtitle/></Sequence></Sequence>
```

## Nesting compositions within another

To place one composition inside another, use `<Sequence>` with `width` + `height`.

```tsx
<AbsoluteFill><Sequence width={COMPOSITION_WIDTH} height={COMPOSITION_HEIGHT}><CompositionComponent/></Sequence></AbsoluteFill>
```
