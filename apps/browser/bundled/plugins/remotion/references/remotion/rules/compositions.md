A `<Composition>` defines component, width, height, fps, duration for renderable video.

Usually put in `src/Root.tsx`.

```tsx
import{Composition}from"remotion";import{MyComposition}from"./MyComposition";export const RemotionRoot=()=>{return <Composition id="MyComposition" component={MyComposition} durationInFrames={100} fps={30} width={1080} height={1080}/>;};
```

## Default Props

Pass `defaultProps` for initial component values.  
Values must be JSON-serializable. `Date`, `Map`, `Set`, `staticFile()` supported.

```tsx
import{Composition}from"remotion";import{MyComposition,MyCompositionProps}from"./MyComposition";export const RemotionRoot=()=>{return <Composition id="MyComposition" component={MyComposition} durationInFrames={100} fps={30} width={1080} height={1080} defaultProps={{title:"Hello World",color:"#ff0000"} satisfies MyCompositionProps}/>;};
```

Use `type`, not `interface`, for props if you want `defaultProps` type safety.

## Folders

Use `<Folder>` to group compositions in sidebar.  
Folder names: letters, numbers, hyphens only.

```tsx
import{Composition,Folder}from"remotion";export const RemotionRoot=()=>{return<><Folder name="Marketing"><Composition id="Promo" /* ... */ /><Composition id="Ad" /* ... */ /></Folder><Folder name="Social"><Folder name="Instagram"><Composition id="Story" /* ... */ /><Composition id="Reel" /* ... */ /></Folder></Folder></>};
```

## Stills

Use `<Still>` for single-frame images. No `durationInFrames` or `fps` needed.

```tsx
import{Still}from"remotion";import{Thumbnail}from"./Thumbnail";export const RemotionRoot=()=>{return <Still id="Thumbnail" component={Thumbnail} width={1280} height={720}/>;};
```

## Calculate Metadata

Use `calculateMetadata` to make size, duration, or props dynamic from data.

```tsx
import{Composition,CalculateMetadataFunction}from"remotion";import{MyComposition,MyCompositionProps}from"./MyComposition";const calculateMetadata:CalculateMetadataFunction<MyCompositionProps>=async({props,abortSignal})=>{const data=await fetch(`https://api.example.com/video/${props.videoId}`,{signal:abortSignal}).then((res)=>res.json());return{durationInFrames:Math.ceil(data.duration*30),props:{...props,videoUrl:data.url}}};export const RemotionRoot=()=>{return <Composition id="MyComposition" component={MyComposition} durationInFrames={100} fps={30} width={1080} height={1080} defaultProps={{videoId:"abc123"}} calculateMetadata={calculateMetadata}/>;};
```

Can return `props`, `durationInFrames`, `width`, `height`, `fps`, codec defaults. Runs once before render.

## Nest composition inside another

Use `<Sequence>` with `width` + `height` to place one composition inside another.

```tsx
<AbsoluteFill><Sequence width={COMPOSITION_WIDTH} height={COMPOSITION_HEIGHT}><CompositionComponent /></Sequence></AbsoluteFill>
```
