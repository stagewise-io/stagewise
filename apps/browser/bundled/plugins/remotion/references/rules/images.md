Always use `<Img>` from `remotion` for images: ```import{Img,staticFile}from"remotion";export const MyComposition=()=>{return<Img src={staticFile("photo.png")} />};```

Must use `<Img>` from `remotion`. Do not use: native HTML `<img>`, Next.js `<Image>`, CSS `background-image`.

`<Img>` waits for full load before render. No flicker. No blank export frames.

## Local images with `staticFile()`

Put images in `public/`. Use `staticFile()`.

```
my-video/
├─ public/
│  ├─ logo.png
│  ├─ avatar.jpg
│  └─ icon.svg
├─ src/
├─ package.json
```

```import{Img,staticFile}from"remotion";export const MyComposition=()=>{return<Img src={staticFile("photo.png")} />};```

## Remote images

Remote URLs work direct, no `staticFile()`: ```<Img src="https://example.com/image.png"/>```

Need CORS. For animated GIFs, use `<Gif>` from `@remotion/gif`.

## Sizing and positioning

Use `style`: ```<Img src={staticFile("photo.png")} style={{width:500,height:300,position:"absolute",top:100,left:50,objectFit:"cover"}}/>```

## Dynamic image paths

Use template literals for dynamic paths.

```tsx
import{Img,staticFile,useCurrentFrame}from"remotion";
const frame=useCurrentFrame();
// Image sequence
<Img src={staticFile(`frames/frame${frame}.png`)}/>
// From props
<Img src={staticFile(`avatars/${props.userId}.png`)}/>
// Conditional
<Img src={staticFile(`icons/${isActive ? "active" : "inactive"}.svg`)}/>
```

Good for: image sequences, user avatars/profile images, theme icons, state graphics

## Get image dimensions with `getImageDimensions()`

```import{getImageDimensions,staticFile}from"remotion";const{width,height}=await getImageDimensions(staticFile("photo.png"));```

Useful for aspect ratio or composition sizing.

```import{getImageDimensions,staticFile,CalculateMetadataFunction}from"remotion";const calculateMetadata:CalculateMetadataFunction=async()=>{const{width,height}=await getImageDimensions(staticFile("photo.png"));return{width,height}};```
