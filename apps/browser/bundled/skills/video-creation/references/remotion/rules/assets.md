Put assets in project-root `public/` folder.

## `staticFile()`

Use `staticFile()` for files from `public/`.

```tsx
import {Img,staticFile} from "remotion";export const MyComposition=()=>{return <Img src={staticFile("logo.png")}/>;};
```

It returns encoded URL. Works in subdirectory deploys.

## With components

Images: ```import {Img,staticFile} from "remotion";<Img src={staticFile("photo.png")}/>;```
Videos: ```import {Video} from "@remotion/media";import {staticFile} from "remotion";<Video src={staticFile("clip.mp4")}/>;```
Audio: ```import {Audio} from "@remotion/media";import {staticFile} from "remotion";<Audio src={staticFile("music.mp3")}/>;```
Fonts: ```import {staticFile} from "remotion";const fontFamily=new FontFace("MyFont",`url(${staticFile("font.woff2")})`);await fontFamily.load();document.fonts.add(fontFamily);```

Remote URLs can go direct. No `staticFile()`: ```<Img src="https://example.com/image.png"/><Video src="https://remotion.media/video.mp4"/>```

## Notes

- Remotion components (`<Img>`, `<Video>`, `<Audio>`) wait until asset fully loaded
- Special filename chars (`#`, `?`, `&`) auto-encode
