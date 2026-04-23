Mediabunny reads video duration. Works in browser, Node.js, Bun.

```import{Input,ALL_FORMATS,UrlSource}from"mediabunny";export const getVideoDuration=async(src:string)=>{const input=new Input({formats:ALL_FORMATS,source:new UrlSource(src,{getRetryDelay:()=>null})});const durationInSeconds=await input.computeDuration();return durationInSeconds};```

## Usage

```const duration=await getVideoDuration("https://remotion.media/video.mp4");console.log(duration);/*e.g.10.5(seconds)*/```

For Files from `public/`, wrap path in `staticFile()`: ```import{staticFile}from"remotion";const duration=await getVideoDuration(staticFile("video.mp4"));```

In Node.js and Bun use `FileSource`, not `UrlSource`: ```import{Input,ALL_FORMATS,FileSource}from"mediabunny";const input=new Input({formats:ALL_FORMATS,source:new FileSource(file)});/*File obj from input/drag-drop*/const durationInSeconds=await input.computeDuration();```
