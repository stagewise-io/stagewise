Detect silent segments in video or audio files needs FFmpeg. See [ffmpeg.md](./ffmpeg.md) for Remotion usage.

## Step 1: Measure loudness with `loudnorm`

Use `loudnorm` JSON mode to get EBU R128 integrated loudness + gating threshold per file.

```bash
npx remotion ffmpeg -i public/video.mov -map 0:a -af loudnorm=print_format=json -f null /dev/null
```

Output gives:

- `input_i`: integrated loudness in dB. Overall perceived volume.
- `input_thresh`: EBU R128 gating threshold in dB. Audio below this too quiet to count.

## Step 2: Detect silences using adaptive threshold

Pass `input_thresh` from step 1 as `noise` in `silencedetect`.

```bash
npx remotion ffmpeg -i public/video.mov -map 0:a -af "silencedetect=noise=${THRESH}dB:d=0.5" -f null /dev/null
```

Parameters:

- `noise`: silence threshold. Use `input_thresh` from step 1.
- `d`: minimum silence duration in seconds. `0.5` good default.

## Interpreting output

Filter emits `silence_start` / `silence_end` pairs.

```
[silencedetect] silence_start: 0
[silencedetect] silence_end: 2.241021 | silence_duration: 2.241021
[silencedetect] silence_start: 38.77425
[silencedetect] silence_end: 39.619604 | silence_duration: 0.845354
```

## Identifying leading and trailing silence

- **Leading silence**: consecutive silent segments starting at or near `0`. If first `silence_start` > `0.5s`, no leading silence.
- **Trailing silence**: last silent segment reaching near file end. Compare last `silence_end` to full duration.

If many silences almost touch at start/end (`gap < 0.2s`), treat as one leading/trailing block.

## Using with Remotion's `<Video>` component

Apply trim points with `trimBefore` + `trimAfter`. Values are frames.

```tsx
import{Video}from"@remotion/media";import{staticFile,useVideoConfig}from"remotion";const{fps}=useVideoConfig();
<Video src={staticFile("video.mov")} trimBefore={Math.floor(leadingEnd*fps)} trimAfter={Math.ceil(trailingStart*fps)}/>;
```
