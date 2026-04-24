To import `.srt` subtitles: If you already have `.srt`, use `parseSrt()` from `@remotion/captions`.

If no `.srt`, read `transcribe-captions.md` instead.

## Reading an `.srt` file

Use `staticFile()` for `.srt` in `public/`, then fetch + parse.

```tsx
import{useState,useEffect,useCallback}from"react";import{AbsoluteFill,staticFile,useDelayRender}from"remotion";import{parseSrt}from"@remotion/captions";import type{Caption}from"@remotion/captions";export const MyComponent:React.FC=()=>{const[captions,setCaptions]=useState<Caption[]|null>(null);const{delayRender,continueRender,cancelRender}=useDelayRender();const[handle]=useState(()=>delayRender());const fetchCaptions=useCallback(async()=>{try{const response=await fetch(staticFile("subtitles.srt"));const text=await response.text();const{captions:parsed}=parseSrt({input:text});setCaptions(parsed);continueRender(handle)}catch(e){cancelRender(e)}},[continueRender,cancelRender,handle]);useEffect(()=>{fetchCaptions()},[fetchCaptions]);if(!captions){return null}return<AbsoluteFill>{}</AbsoluteFill>;};
```

Remote URLs work too. Can `fetch()` remote file direct instead of `staticFile()`.

## Using imported captions

After parse, captions are in `Caption` format. Use with all `@remotion/captions` utils.
