Show captions in Remotion. Assume captions already in [`Caption`](https://www.remotion.dev/docs/captions/caption) format.

## Need

Read [Transcribing audio](transcribe-captions.md) for caption generation.

Install [`@remotion/captions`](https://www.remotion.dev/docs/captions):

```bash
npx remotion add @remotion/captions
```

## Fetch captions

Fetch captions JSON. Use [`useDelayRender()`](https://www.remotion.dev/docs/use-delay-render) to block render until captions load.

```tsx
import{useState,useEffect,useCallback}from"react";import{AbsoluteFill,staticFile,useDelayRender}from"remotion";import type{Caption}from"@remotion/captions";
export const MyComponent:React.FC=()=>{const[captions,setCaptions]=useState<Caption[]|null>(null);const{delayRender,continueRender,cancelRender}=useDelayRender();const[handle]=useState(()=>delayRender());const fetchCaptions=useCallback(async()=>{try{const response=await fetch(staticFile("captions123.json"));const data=await response.json();setCaptions(data);continueRender(handle)}catch(e){cancelRender(e)}},[continueRender,cancelRender,handle]);useEffect(()=>{fetchCaptions()},[fetchCaptions]);if(!captions){return null}return <AbsoluteFill>{/* Render captions here */}</AbsoluteFill>};
```

## Create pages

Use `createTikTokStyleCaptions()` to group captions into pages. `combineTokensWithinMilliseconds` controls how many words show at once.

```tsx
import{useMemo}from"react";import{createTikTokStyleCaptions}from"@remotion/captions";import type{Caption}from"@remotion/captions";const SWITCH_CAPTIONS_EVERY_MS=1200;const{pages}=useMemo(()=>{return createTikTokStyleCaptions({captions,combineTokensWithinMilliseconds:SWITCH_CAPTIONS_EVERY_MS})},[captions]);
```

Higher value = more words per page. Lower value = more word-by-word.

## Render with `Sequence`

Map pages. Render each in `<Sequence>`. Compute start frame + duration from page timing.

```tsx
import{Sequence,useVideoConfig,AbsoluteFill}from"remotion";import type{TikTokPage}from"@remotion/captions";
const CaptionedContent:React.FC=()=>{const{fps}=useVideoConfig();return(<AbsoluteFill>{pages.map((page,index)=>{const nextPage=pages[index+1]??null;const startFrame=page.startMs/1000*fps;const endFrame=Math.min(nextPage?nextPage.startMs/1000*fps:Infinity,startFrame+SWITCH_CAPTIONS_EVERY_MS/1000*fps);const durationInFrames=endFrame-startFrame;if(durationInFrames<=0){return null}return <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}><CaptionPage page={page}/></Sequence>})}</AbsoluteFill>)};
```

## White-space

Captions are whitespace-sensitive. Put spaces in `text` before each word. Use `whiteSpace: "pre"` to preserve them.

## Separate caption component

Put caption logic in separate component. New file.

## Word highlight

Caption page has `tokens`. Use them to highlight current word.

```tsx
import{AbsoluteFill,useCurrentFrame,useVideoConfig}from"remotion";import type{TikTokPage}from"@remotion/captions";const HIGHLIGHT_COLOR="#39E508";const CaptionPage:React.FC<{page:TikTokPage}>=({page})=>{const frame=useCurrentFrame();const{fps}=useVideoConfig();const currentTimeMs=frame/fps*1000;const absoluteTimeMs=page.startMs+currentTimeMs;return(<AbsoluteFill style={{justifyContent:"center",alignItems:"center"}}><div style={{fontSize:80,fontWeight:"bold",whiteSpace:"pre"}}>{page.tokens.map((token)=>{const isActive=token.fromMs<=absoluteTimeMs&&token.toMs>absoluteTimeMs;return <span key={token.fromMs} style={{color:isActive?HIGHLIGHT_COLOR:"white"}}>{token.text}</span>})}</div></AbsoluteFill>)};
```

## Show captions with video

Usually put captions with video content so sync stays right. Use separate captions JSON per video.

```tsx
<AbsoluteFill><Video src={staticFile("video.mp4")}/><CaptionPage page={page}/></AbsoluteFill>
```
