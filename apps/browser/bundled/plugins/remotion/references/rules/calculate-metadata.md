# `calculateMetadata`

Use on `<Composition>` to set duration, size, fps, output name, or props before render.

```tsx
<Composition id="MyComp" component={MyComponent} durationInFrames={300} fps={30} width={1920} height={1080} defaultProps={{videoSrc:"https://remotion.media/video.mp4"}} calculateMetadata={calculateMetadata}/>
```

## Duration from one video

Use [`getVideoDuration`](./get-video-duration.md). Use [`getVideoDimensions`](./get-video-dimensions.md) too when needed.

```tsx
import{CalculateMetadataFunction}from"remotion";import{getVideoDuration}from"./get-video-duration";const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{const durationInSeconds=await getVideoDuration(props.videoSrc);return{durationInFrames:Math.ceil(durationInSeconds*30)}};
```

## Match video size

Use [`getVideoDimensions`](./get-video-dimensions.md).

```tsx
import{CalculateMetadataFunction}from"remotion";import{getVideoDimensions}from"./get-video-dimensions";const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{const dimensions=await getVideoDimensions(props.videoSrc);return{width:dimensions.width,height:dimensions.height}};
```

## Duration from many videos

```tsx
const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{const allMetadata=await Promise.all(props.videos.map((video)=>getVideoDuration(video.src)));const totalDuration=allMetadata.reduce((sum,durationInSeconds)=>sum+durationInSeconds,0);return{durationInFrames:Math.ceil(totalDuration*30)}};
```

## Default outName

Set output filename from props.

```tsx
const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{return{defaultOutName:`video-${props.id}`}};
```

`.mp4` added automatically.

## Transform props

Fetch or reshape props before render.

```tsx
const calculateMetadata:CalculateMetadataFunction<Props>=async({props,abortSignal})=>{const response=await fetch(props.dataUrl,{signal:abortSignal});const data=await response.json();return{props:{...props,fetchedData:data}}};
```

`abortSignal` cancels stale Studio requests when props change.

## Return

All fields optional. Returned values override `<Composition>` props.

- `durationInFrames`: frame count
- `width`: width in px
- `height`: height in px
- `fps`: frames per second
- `props`: transformed component props
- `defaultOutName`: default output filename
- `defaultCodec`: default render codec
