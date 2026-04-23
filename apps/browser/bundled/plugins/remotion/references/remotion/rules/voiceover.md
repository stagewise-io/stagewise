For voiceovers, use ElevenLabs TTS to generate speech audio per scene, then use `./calculate-metadata` to dynamically size the composition to match the audio.

## Prerequisites

By default this guide uses **ElevenLabs** as TTS provider (`ELEVENLABS_API_KEY` environment variable). Users may substitute any TTS service that can produce an audio file.
If the user has not specified a TTS provider, recommend ElevenLabs and ask for their API key.
Ensure the environment variable is available when running the generation script:

```bash
node --strip-types generate-voiceover.ts
```

## Generating audio with ElevenLabs

Create a script that reads the config, calls the ElevenLabs API for each scene, and writes MP3 files to the `public/` directory so Remotion can access them via `staticFile()`.
The core API call for a single scene:

```ts
const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
{method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY!,"Content-Type":"application/json",Accept:"audio/mpeg",},body:JSON.stringify({text: "Welcome to the show.",model_id: "eleven_multilingual_v2",voice_settings:{stability:0.5,similarity_boost:0.75,style:0.3}})});
const audioBuffer=Buffer.from(await response.arrayBuffer());writeFileSync(`public/voiceover/${compositionId}/${scene.id}.mp3`,audioBuffer);
```

## Dynamic composition duration with calculateMetadata

Use `./calculate-metadata.md` to measure audio duration(`./get-audio-duration.md`) and set the composition length accordingly.

```tsx
import{CalculateMetadataFunction,staticFile}from"remotion";import{getAudioDuration}from"./get-audio-duration";
const FPS=30;const SCENE_AUDIO_FILES=["voiceover/my-comp/scene-01-intro.mp3","voiceover/my-comp/scene-02-main.mp3","voiceover/my-comp/scene-03-outro.mp3"];
export const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{
const durations=await Promise.all(SCENE_AUDIO_FILES.map((file)=>getAudioDuration(staticFile(file))));
const sceneDurations=durations.map((durationInSeconds)=>{return durationInSeconds*FPS;});
return{durationInFrames:Math.ceil(sceneDurations.reduce((sum,d)=>sum+d,0))};
};
```

The computed `sceneDurations` are passed into the component via a `voiceover` prop so the component knows how long each scene should be.
If the composition uses `<TransitionSeries>` (see `./transitions.md`), subtract the overlap from total duration: `./transitions.md#calculating-total-composition-duration`

## Rendering audio in the component

See `./audio.md` for more info.

## Delaying audio start

See `./audio.md#delaying` for more info.
