Only works on Remotion `4.0.415+`. Use `npx remotion versions` to check. Use `npx remotion upgrade` to upgrade.

`<LightLeak>` from `@remotion/light-leaks` renders WebGL light leak. It reveals in first half, retracts in second half.

Usually put inside `<TransitionSeries.Overlay>` over cut between scenes. See **transitions** rule for `<TransitionSeries>` + overlay use.

## Basic usage with TransitionSeries

```tsx
import{TransitionSeries}from"@remotion/transitions";import{LightLeak}from"@remotion/light-leaks";
<TransitionSeries><TransitionSeries.Sequence durationInFrames={60}><SceneA /></TransitionSeries.Sequence><TransitionSeries.Overlay durationInFrames={30}><LightLeak /></TransitionSeries.Overlay><TransitionSeries.Sequence durationInFrames={60}><SceneB /></TransitionSeries.Sequence></TransitionSeries>;
```

## Props

`durationInFrames?`: defaults to parent sequence/composition duration. Reveals first half, retracts second half.
`seed?`: controls light leak shape. Different seed = different pattern. Default: `0`.
`hueShift?`: rotates hue in degrees `0-360`. Default `0`=yellow-orange. `120`=green. `240`=blue.

## Customizing look

```tsx
import{LightLeak}from"@remotion/light-leaks";

// Blue tint, different pattern
<LightLeak seed={5} hueShift={240}/>;

// Green tint
<LightLeak seed={2} hueShift={120}/>;
```

## Standalone usage

`<LightLeak>` also works outside `<TransitionSeries>`. Example: decorative overlay in any composition.

```tsx
import{AbsoluteFill}from"remotion";import{LightLeak}from"@remotion/light-leaks";
const MyComp:React.FC=()=>(<AbsoluteFill><MyContent/><LightLeak durationInFrames={60} seed={3}/></AbsoluteFill>);
```
