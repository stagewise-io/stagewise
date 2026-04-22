Use `<AnimatedImage>` for GIF, APNG, AVIF, WebP synced to Remotion timeline.

```import{AnimatedImage,staticFile}from"remotion";export const MyComposition=()=>{return<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} />};```

Remote URL works too (Needs CORS):```<AnimatedImage src="https://example.com/animation.gif" width={500} height={500}/>```

## Sizing and fit

Use `fit` to control fill behavior.

```tsx
// Stretch fill. Default.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="fill"/>

// Keep aspect ratio. Fit inside.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="contain"/>

// Fill box. Crop if needed.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="cover"/>
```

## Use `playbackRate` for speed control

```tsx
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={2} />
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={0.5} />
```

## Looping behavior

Choose what happens after animation ends.

```tsx
// Loop forever. Default.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="loop" />

// Play once. Hold last frame.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="pause-after-finish" />

// Play once. Then clear.
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="clear-after-finish" />
```

## Styling

Use `style` for extra CSS. Use `width` + `height` for sizing.

```tsx
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} style={{borderRadius:20,position:"absolute",top:100,left:50}}/>
```

## Get GIF duration with  `getGifDurationInSeconds()` from `@remotion/gif`

```tsx
import{getGifDurationInSeconds}from"@remotion/gif";import{staticFile}from"remotion";const duration=await getGifDurationInSeconds(staticFile("animation.gif"));console.log(duration)/*e.g.2.5*/;
```

Useful when composition duration should match GIF.

```tsx
import{getGifDurationInSeconds}from"@remotion/gif";import{staticFile,CalculateMetadataFunction}from"remotion";const calculateMetadata:CalculateMetadataFunction=async()=>{const duration=await getGifDurationInSeconds(staticFile("animation.gif"));return{durationInFrames:Math.ceil(duration*30)}};
```

## Alternative if `<AnimatedImage>` fails

Only Chrome + Firefox support it. Use `<Gif>` from `@remotion/gif` instead.

```tsx
import{Gif}from"@remotion/gif";import{staticFile}from"remotion";export const MyComposition=()=>{return<Gif src={staticFile("animation.gif")} width={500} height={500} />};
```

`<Gif>` has same props as `<AnimatedImage>`, but works ONLY for GIF files.
