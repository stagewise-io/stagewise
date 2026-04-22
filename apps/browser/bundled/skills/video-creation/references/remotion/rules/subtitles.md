All captions must be JSON. Use `Caption` type:

```import type{Caption}from"@remotion/captions";```

Definition: ```type Caption={text:string;startMs:number;endMs:number;timestampMs:number|null;confidence:number|null};```

## Generating captions

To transcribe video/audio into captions, read `./transcribe-captions.md`

## Displaying captions

To show captions in video, read `./display-captions.md`

## Importing captions

To import captions from `.srt`, read `./import-srt-captions.md`
