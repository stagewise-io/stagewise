Use `<Sequence>` with negative `from` to trim start of animation.

## Trim Beginning

Negative `from` shifts time backward. Animation starts partway through: ```import{Sequence,useVideoConfig}from"remotion";const fps=useVideoConfig();<Sequence from={-0.5*fps}><MyAnimation /></Sequence>;```

Animation appears 0.5 seconds into progress. First 0.5 seconds trimmed.
Inside `<MyAnimation>`, `useCurrentFrame()` starts at `15`, not `0`.

## Trim End

Use `durationInFrames` to unmount after fixed duration: ```<Sequence durationInFrames={1.5*fps}><MyAnimation/></Sequence>```

Animation plays 1.5 seconds, then unmounts.

## Trim and Delay

Nest sequences to trim start and delay appearance: ```<Sequence from={30}><Sequence from={-15}><MyAnimation/></Sequence></Sequence>```

Inner sequence trims first 15 frames. Outer sequence delays result by 30 frames.
