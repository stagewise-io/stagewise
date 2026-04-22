## New project setup

In empty folder/workspace with no Remotion project, scaffold one:

```bash
npx create-video@latest --yes --blank --no-tailwind my-video
```

Replace `my-video` with good name. Creates new folder with full project.

Start Studio to preview video: ```npx remotion studio```

## Add packages

```bash
npx remotion add ...
bunx remotion add ...
yarn remotion add ...
pnpm exec remotion add ...
```

## Set render defaults

```ts
// remotion.config.ts
import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuva444p10le");
Config.setCodec("prores");
Config.setProResProfile("4444");
```

## Optional: one-frame render check

Can render one frame with CLI to sanity-check layout, color, timing. Skip for trivial edits, pure refactors, or when Studio/prior renders enough.

```bash
npx remotion still [composition-id] --scale=0.25 --frame=30
```

At `30 fps`, `--frame=30` = one-second mark. `--frame` is zero-based.

If working with captions/subtitles, read `./rules/subtitles.md`.

If trimming video or doing silence detection, read `./rules/ffmpeg.md`.

If detecting + trimming silent audio/video segments, read `./rules/silence-detection.md`.

If visualizing audio: spectrum bars, waveforms, bass-react effects, read `./rules/audio-visualization.md`.

If using sound effects, read `./rules/sfx.md`.

Respect workspace code style. If none, use normal pretty formatting. Examples may be minified. Your code should not be.

## How to use

Read rule files as needed:

- `./rules/3d.md` — 3D with Three.js + React Three Fiber
- `./rules/animations.md` — core animation rules
- `./rules/assets.md` — import images, video, audio, fonts
- `./rules/audio.md` — audio import, trim, volume, speed, pitch
- `./rules/calculate-metadata.md` — dynamic duration, size, props
- `./rules/can-decode.md` — browser decode check with Mediabunny
- `./rules/charts.md` — bar, pie, line, stock charts
- `./rules/compositions.md` — compositions, stills, folders, props, metadata
- `./rules/extract-frames.md` — extract video frames with Mediabunny
- `./rules/fonts.md` — Google + local fonts
- `./rules/get-audio-duration.md` — audio duration with Mediabunny
- `./rules/get-video-dimensions.md` — video width + height with Mediabunny
- `./rules/get-video-duration.md` — video duration with Mediabunny
- `./rules/gifs.md` — GIF/APNG/AVIF/WebP use
- `./rules/images.md` — images with `<Img>`
- `./rules/light-leaks.md` — light leak overlays
- `./rules/lottie.md` — Lottie use
- `./rules/measuring-dom-nodes.md` — DOM size measurement
- `./rules/measuring-text.md` — text measure, fit, overflow
- `./rules/sequencing.md` — delay, trim, duration patterns
- `./rules/tailwind.md` — Tailwind in Remotion
- `./rules/text-animations.md` — text motion patterns
- `./rules/timing.md` — interpolate, Bézier easing, springs
- `./rules/transitions.md` — scene transitions + overlays
- `./rules/transparent-videos.md` — render alpha video
- `./rules/trimming.md` — trim animation start/end
- `./rules/videos.md` — video trim, volume, speed, loop, pitch
- `./rules/parameters.md` — Zod composition params
- `./rules/maps.md` — Mapbox maps + animation
- `./rules/silence-detection.md` — adaptive silence detection with FFmpeg
- `./rules/voiceover.md` — AI voiceover with ElevenLabs
