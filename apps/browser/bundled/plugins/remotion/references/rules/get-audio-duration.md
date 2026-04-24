Mediabunny reads audio duration. Works in browser, Node.js, Bun.

## Get audio duration

```tsx
import{Input,ALL_FORMATS,UrlSource}from"mediabunny";
export const getAudioDuration=async(src:string)=>{const input=new Input({formats:ALL_FORMATS,source:new UrlSource(src,{getRetryDelay:()=>null})});const durationInSeconds=await input.computeDuration();return durationInSeconds;};
```

Usage: ```const duration=await getAudioDuration("https://remotion.media/audio.mp3");console.log(duration); /*e.g. 180.5 (seconds)*/```

With `staticFile()` in Remotion: ```import{staticFile}from"remotion";const duration=await getAudioDuration(staticFile("audio.mp3"));```

In Node.js and Bun use `FileSource`, not `UrlSource`: ```import{Input,ALL_FORMATS,FileSource}from"mediabunny";const input=new Input({formats:ALL_FORMATS,source:new FileSource(file)}); /*File object from input or drag-drop*/```
