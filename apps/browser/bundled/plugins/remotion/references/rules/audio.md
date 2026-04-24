Need `@remotion/media`.

## Import audio

Use `<Audio>` from `@remotion/media`.

```tsx
import{Audio}from"@remotion/media";import{staticFile}from"remotion";export const MyComposition=()=>{return <Audio src={staticFile("audio.mp3")}/>;};
```

Remote URL works too: ```<Audio src="https://remotion.media/audio.mp3"/>```

Default: start now, full volume, full length. Stack many `<Audio>` for many tracks.

## Manipulation

Trim with `trimBefore` + `trimAfter` (Values in frames): ```const{fps}=useVideoConfig();return <Audio src={staticFile("audio.mp3")} trimBefore={2*fps} trimAfter={10*fps}/>;``` (Still starts at composition start. Only selected slice plays.)

Delay by wrapping in `<Sequence>` to start later: ```import{Sequence,staticFile}from"remotion";import{Audio}from"@remotion/media";const{fps}=useVideoConfig();return <Sequence from={1*fps}><Audio src={staticFile("audio.mp3")}/></Sequence>;``` (Starts after 1 sec)

Set Volume statically (0-1): ```<Audio src={staticFile("audio.mp3")} volume={0.5}/>``` or dynamically with callback: ```import{interpolate}from"remotion";const{fps}=useVideoConfig();return <Audio src={staticFile("audio.mp3")} volume={(f)=>interpolate(f,[0,1*fps],[0,1],{extrapolateRight:"clamp"})}/>;``` (`f` starts at `0` when audio starts, not composition frame).

Mute with `muted`. (Can be dynamic): ```const frame=useCurrentFrame();const{fps}=useVideoConfig();return <Audio src={staticFile("audio.mp3")} muted={frame>=2*fps&&frame<=4*fps}/>;```

Set Speed with `playbackRate`: ```<Audio src={staticFile("audio.mp3")} playbackRate={2}/><Audio src={staticFile("audio.mp3")} playbackRate={0.5}/>```. Reverse playback NOT supported.

Loop with `loop` for endless repeat: ```<Audio src={staticFile("audio.mp3")} loop/>```.
`loopVolumeCurveBehavior` controls loop frame count:

- `"repeat"`: frame resets each loop. Default.
- `"extend"`: frame keeps going. (Example: ```<Audio src={staticFile("audio.mp3")} loop loopVolumeCurveBehavior="extend" volume={(f)=>interpolate(f,[0,300],[1,0])}/>```)

Set Pitch with `toneFrequency`. Range `0.01-2`. Changes pitch, not speed. (Example: ```<Audio src={staticFile("audio.mp3")} toneFrequency={1.5}/><Audio src={staticFile("audio.mp3")} toneFrequency={0.8}/>```)
Pitch shift works only in server render. No Studio preview. No `<Player />`.
