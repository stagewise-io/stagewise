Need `@remotion/media-utils`.

## Load audio

Use `useWindowedAudioData()` (<https://www.remotion.dev/docs/use-windowed-audio-data>):

```tsx
import{useWindowedAudioData}from"@remotion/media-utils";import{staticFile,useCurrentFrame,useVideoConfig}from"remotion";
const frame=useCurrentFrame();const{fps}=useVideoConfig();const{audioData,dataOffsetInSeconds}=useWindowedAudioData({src:staticFile("podcast.wav"),frame,fps,windowInSeconds:30});
```

## Spectrum bars

Use `visualizeAudio()` (<https://www.remotion.dev/docs/visualize-audio>) for frequency bars:

```tsx
import{useWindowedAudioData,visualizeAudio}from"@remotion/media-utils";import{staticFile,useCurrentFrame,useVideoConfig}from"remotion";
const frame=useCurrentFrame();const{fps}=useVideoConfig();const{audioData,dataOffsetInSeconds}=useWindowedAudioData({src:staticFile("music.mp3"),frame,fps,windowInSeconds:30});
if(!audioData){return null}const frequencies=visualizeAudio({fps,frame,audioData,numberOfSamples:256,optimizeFor:"speed",dataOffsetInSeconds});return(<div style={{display:"flex",alignItems:"flex-end",height:200}}>{frequencies.map((v,i)=>(<div key={i} style={{flex:1,height:`${v*100}%`,backgroundColor:"#0b84f3",margin:"0 1px"}}/>))}</div>);
```

- `numberOfSamples` must be power of 2: `32,64,128,256,512,1024`
- Value range `0-1`; left=bass, right=highs
- Use `optimizeFor: "speed"` for Lambda or high sample count

Pass parent `frame` into child too. No child `useCurrentFrame()` when child sits in offset `<Sequence>`. Else viz jump.

## Waveform

Use `visualizeAudioWaveform()` (<https://www.remotion.dev/docs/media-utils/visualize-audio-waveform>) + `createSmoothSvgPath()` (<https://www.remotion.dev/docs/media-utils/create-smooth-svg-path>):

```tsx
import{createSmoothSvgPath,useWindowedAudioData,visualizeAudioWaveform}from"@remotion/media-utils";import{staticFile,useCurrentFrame,useVideoConfig}from"remotion";
const frame=useCurrentFrame();const{width,fps}=useVideoConfig();const HEIGHT=200;const{audioData,dataOffsetInSeconds}=useWindowedAudioData({src:staticFile("voice.wav"),frame,fps,windowInSeconds:30});
if(!audioData){return null}const waveform=visualizeAudioWaveform({fps,frame,audioData,numberOfSamples:256,windowInSeconds:0.5,dataOffsetInSeconds});const path=createSmoothSvgPath({points:waveform.map((y,i)=>({x:i/(waveform.length-1)*width,y:HEIGHT/2+y*HEIGHT/2}))});return(<svg width={width} height={HEIGHT}><path d={path} fill="none" stroke="#0b84f3" strokeWidth={2}/></svg>);
```

## Bass react

Use low frequencies for beat-react motion:

```tsx
const frequencies=visualizeAudio({fps,frame,audioData,numberOfSamples:128,optimizeFor:"speed",dataOffsetInSeconds});const lowFrequencies=frequencies.slice(0,32);
const bassIntensity=lowFrequencies.reduce((sum,v)=>sum+v,0)/lowFrequencies.length;const scale=1+bassIntensity*0.5;const opacity=Math.min(0.6,bassIntensity*0.8);
```

## Volume waveform

Use `getWaveformPortion()`(<https://www.remotion.dev/docs/get-waveform-portion>) for simpler volume data:

```tsx
import{getWaveformPortion}from"@remotion/media-utils";import{useCurrentFrame,useVideoConfig}from"remotion";
const frame=useCurrentFrame();const{fps}=useVideoConfig();const currentTimeInSeconds=frame/fps;const waveform=getWaveformPortion({audioData,startTimeInSeconds:currentTimeInSeconds,durationInSeconds:5,numberOfSamples:50});
waveform.map((bar)=>(<div key={bar.index} style={{height:bar.amplitude*100}}/>));
```

## Postprocess

Low frequencies dominate. Use log scaling for balance:

```tsx
const minDb=-100;const maxDb=-30;const scaled=frequencies.map((value)=>{const db=20*Math.log10(value);return (db-minDb)/(maxDb-minDb);});
```
