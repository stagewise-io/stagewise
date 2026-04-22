Use `<Video>` from `@remotion/media` (install if needed).

```import{Video}from"@remotion/media";import{staticFile}from"remotion";export const MyComposition=()=>{return <Video src={staticFile("video.mp4")}/>;};```

Remote URL works too:

```<Video src="https://remotion.media/video.mp4"/>```

## Manipulations

Trimming with `trimBefore` + `trimAfter` (Values are frames): ```const{fps}=useVideoConfig();return <Video src={staticFile("video.mp4")} trimBefore={2*fps} trimAfter={10*fps}/>;```

Delay by Wrapping in `<Sequence>` to show later: ```import{Sequence,staticFile}from"remotion";import{Video}from"@remotion/media";const{fps}=useVideoConfig();return <Sequence from={1*fps}><Video src={staticFile("video.mp4")}/></Sequence>;``` (Video appears after 1 sec)

Resize and position with `style`: ```<Video src={staticFile("video.mp4")} style={{width:500,height:300,position:"absolute",top:100,left:50,objectFit:"cover"}}/>```

Set volume statically with `volume` prop (0-1): ```<Video src={staticFile("video.mp4")} volume={0.5} />```

Set volume dynamically with callback: ```import{interpolate}from"remotion";const{fps}=useVideoConfig();return <Video src={staticFile("video.mp4")} volume={(f)=>interpolate(f,[0,1*fps],[0,1],{extrapolateRight:"clamp"})}/>;```

Use `muted` to silence all audio: ```<Video src={staticFile("video.mp4")} muted/>```

Set speed with `playbackRate` (default: 1): ```<Video src={staticFile("video.mp4")} playbackRate={2} /><Video src={staticFile("video.mp4")} playbackRate={0.5} />```

Reverse playback NOT supported!

Use `loop` for endless repeat: ```<Video src={staticFile("video.mp4")} loop/>```

`loopVolumeCurveBehavior` controls loop frame count:

- `"repeat"`: frame resets each loop. For `volume` callback.
- `"extend"`: frame keeps going (example: ```<Video src={staticFile("video.mp4")} loop loopVolumeCurveBehavior="extend" volume={(f)=>interpolate(f,[0,300],[1,0])}/>```)

Set pitch with `toneFrequency`. Range `0.01-2`. Changes pitch, not speed: ```<Video src={staticFile("video.mp4")} toneFrequency={1.5}/><Video src={staticFile("video.mp4")} toneFrequency={0.8}/>```
Pitch shift works only in server render. No Studio preview. No `<Player />`.
