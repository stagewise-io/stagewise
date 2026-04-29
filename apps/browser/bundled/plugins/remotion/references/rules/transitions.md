`<TransitionSeries>` from `@remotion/transitions` arranges scenes. Two ways to enhance cut point:

- **Transitions** (`<TransitionSeries.Transition>`) — crossfade, slide, wipe, etc. between scenes. Shortens timeline because both scenes play at same time during transition.
- **Overlays** (`<TransitionSeries.Overlay>`) — render effect over cut point without shortening timeline.

Children are absolutely positioned.

## Transition example

```tsx
import{TransitionSeries,linearTiming}from"@remotion/transitions";import{fade}from"@remotion/transitions/fade";
<TransitionSeries><TransitionSeries.Sequence durationInFrames={60}><SceneA/></TransitionSeries.Sequence><TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:15});}/><TransitionSeries.Sequence durationInFrames={60}><SceneB/></TransitionSeries.Sequence></TransitionSeries>;
```

## Overlay example

Any React component can be overlay. For ready-made effect, see **light-leaks** rule.

```tsx
import{TransitionSeries}from"@remotion/transitions";import{LightLeak}from"@remotion/light-leaks";
<TransitionSeries><TransitionSeries.Sequence durationInFrames={60}><SceneA/></TransitionSeries.Sequence><TransitionSeries.Overlay durationInFrames={20}><LightLeak/></TransitionSeries.Overlay><TransitionSeries.Sequence durationInFrames={60}><SceneB/></TransitionSeries.Sequence></TransitionSeries>;
```

## Mixing transitions and overlays

Transitions and overlays can coexist in same `<TransitionSeries>`, but overlay cannot sit next to transition or another overlay.

```tsx
import{TransitionSeries,linearTiming}from"@remotion/transitions";import{fade}from"@remotion/transitions/fade";import{LightLeak}from"@remotion/light-leaks";
<TransitionSeries><TransitionSeries.Sequence durationInFrames={60}><SceneA/></TransitionSeries.Sequence><TransitionSeries.Overlay durationInFrames={30}><LightLeak/></TransitionSeries.Overlay><TransitionSeries.Sequence durationInFrames={60}><SceneB/></TransitionSeries.Sequence><TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:15})}/><TransitionSeries.Sequence durationInFrames={60}><SceneC/></TransitionSeries.Sequence></TransitionSeries>;
```

## Transition props

`<TransitionSeries.Transition>` props:

- `presentation` — visual effect: `fade()`, `slide()`, `wipe()`, etc.
- `timing` — speed/easing: `linearTiming()`, `springTiming()`, etc.

## Overlay props

`<TransitionSeries.Overlay>` props:

- `durationInFrames` — overlay visible length. Positive integer.
- `offset?` — shift relative to cut-point center. Positive=later, negative=earlier. Default `0`.

## Available transition types

Import from their modules: ```import{fade}from"@remotion/transitions/fade";import{slide}from"@remotion/transitions/slide";import{wipe}from"@remotion/transitions/wipe";import{flip}from"@remotion/transitions/flip";import{clockWipe}from"@remotion/transitions/clock-wipe";```

Slide transition with direction: ```import{slide}from"@remotion/transitions/slide";<TransitionSeries.Transition presentation={slide({direction:"from-left"})} timing={linearTiming({durationInFrames:20})}/>;```

Directions: `from-left`,`from-right`,`from-top`,`from-bottom`

## Timing options

```import{linearTiming,springTiming}from"@remotion/transitions";linearTiming({durationInFrames:20});springTiming({config:{damping: 200},durationInFrames:25});```

## Duration calculation

Transitions overlap adjacent scenes, so total composition length is SHORTER than sum of sequence durations. Overlays do NOT change total duration.

Example with two `60`-frame sequences and one `15`-frame transition:

- no transition: `60+60=120`
- with transition: `60+60-15=105`

Overlay between sequences changes nothing.

### Getting duration of transition

`getDurationInFrames()` on timing obj: ```import{linearTiming,springTiming}from"@remotion/transitions";const linearDuration=linearTiming({durationInFrames:20}).getDurationInFrames({fps:30});const springDuration=springTiming({config:{damping:200}}).getDurationInFrames({fps:30});```

If `springTiming` has no explicit `durationInFrames`, duration depends on `fps` because spring settles based on physics.

### Calculating total composition duration

```tsx
import{linearTiming}from"@remotion/transitions";const scene1Duration=60;const scene2Duration=60;const scene3Duration=60;const timing1=linearTiming({durationInFrames:15});const timing2=linearTiming({durationInFrames:20});const transition1Duration=timing1.getDurationInFrames({fps:30});const transition2Duration=timing2.getDurationInFrames({fps:30});const totalDuration=scene1Duration+scene2Duration+scene3Duration-transition1Duration-transition2Duration;
```
