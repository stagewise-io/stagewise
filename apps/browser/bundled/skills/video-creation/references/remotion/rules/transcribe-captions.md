To transcribe audio into captions in Remotion, use `transcribe()` from `@remotion/install-whisper-cpp`

Install `@remotion/install-whisper-cpp` using remotion cli.

## Transcribing

Make Node.js script to download Whisper.cpp + model, then transcribe audio.

```ts
import path from"path";import{downloadWhisperModel,installWhisperCpp,transcribe,toCaptions}from"@remotion/install-whisper-cpp";import fs from"fs";
const to=path.join(process.cwd(),"whisper.cpp");await installWhisperCpp({to,version:"1.5.5"});await downloadWhisperModel({model:"medium.en",folder:to});
// Convert audio to 16KHz wav first if needed:
// import {execSync} from 'child_process';
// execSync('ffmpeg -i /path/to/audio.mp4 -ar 16000 /path/to/audio.wav -y');
const whisperCppOutput=await transcribe({model:"medium.en",whisperPath:to,whisperCppVersion:"1.5.5",inputPath:"/path/to/audio123.wav",tokenLevelTimestamps:true});const{captions}=toCaptions({whisperCppOutput});fs.writeFileSync("captions123.json",JSON.stringify(captions,null,2));
```

Transcribe each clip separately. Make multiple JSON files.

See `./display-captions.md` for display in Remotion.
