Mediabunny reads video width + height. Works in browser, Node.js, Bun.

## Get video dimensions

```tsx
import{Input,ALL_FORMATS,UrlSource }from"mediabunny";
export const getVideoDimensions=async(src:string)=>{const input=new Input({formats:ALL_FORMATS,source:new UrlSource(src,{getRetryDelay:()=> null})});const videoTrack = await input.getPrimaryVideoTrack();if (!videoTrack) {throw new Error("No video track found");}return {width: videoTrack.displayWidth,height: videoTrack.displayHeight};};
```

## Usage

```const dimensions=await getVideoDimensions("https://remotion.media/video.mp4");console.log(dimensions.width)/*e.g.1920*/;console.log(dimensions.height)/*e.g.1080*/;```

### With local files

```tsx
import{Input,ALL_FORMATS,FileSource}from"mediabunny";const input=new Input({formats:ALL_FORMATS,source:new FileSource(file)})/*File obj from input/drag-drop*/;const videoTrack=await input.getPrimaryVideoTrack();const width=videoTrack.displayWidth;const height=videoTrack.displayHeight;
```

With `staticFile()` in Remotion: ```import{staticFile}from"remotion";const dimensions=await getVideoDimensions(staticFile("video.mp4"));```
