No need install `ffmpeg` or `ffprobe`. Use `npx remotion ffmpeg` and `npx remotion ffprobe`.

```bash
npx remotion ffmpeg -i input.mp4 output.mp3
npx remotion ffprobe input.mp4
```

### Trimming videos

Two trim options.

1. **Preferred**: Use `<Video>` `trimBefore` + `trimAfter`. Non-destructive. No re-encode. Can change anytime.

```tsx
import{Video}from'@remotion/media';<Video src={staticFile('video.mp4')} trimBefore={5*fps} trimAfter={10*fps}/>;
```

1. Use FFmpeg CLI. Must re-encode or start can freeze. Use only if you need standalone trimmed file for upload/external use.

```bash
# Re-encodes from exact frame
npx remotion ffmpeg -ss 00:00:05 -i public/input.mp4 -to 00:00:10 -c:v libx264 -c:a aac public/output.mp4
```
