Remotion can render transparent videos two ways: ProRes or WebM.

## Transparent ProRes

Best when importing into video editing software.

**CLI:**

```bash
npx remotion render --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444 MyComp out.mov
```

**Default in Studio**. Restart Studio after change.

```ts
// remotion.config.ts
import{Config}from"@remotion/cli/config";Config.setVideoImageFormat("png");Config.setPixelFormat("yuva444p10le");Config.setCodec("prores");Config.setProResProfile("4444");
```

**Set as default export settings for composition** with `calculateMetadata`.

```tsx
import{CalculateMetadataFunction}from"remotion";
const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{return{defaultCodec:"prores",defaultVideoImageFormat:"png",defaultPixelFormat:"yuva444p10le",defaultProResProfile:"4444"};};
<Composition id="my-video" component={MyVideo} durationInFrames={150} fps={30} width={1920} height={1080} calculateMetadata={calculateMetadata}/>
```

## Transparent WebM (VP9)

Best for browser playback.

**CLI:**

```bash
npx remotion render --image-format=png --pixel-format=yuva420p --codec=vp9 MyComp out.webm
```

**Default in Studio**. Restart Studio after change.

```ts
// remotion.config.ts
import{Config}from"@remotion/cli/config";Config.setVideoImageFormat("png");Config.setPixelFormat("yuva420p");Config.setCodec("vp9");
```

**Set as default export settings for composition** with `calculateMetadata`.

```tsx
import{CalculateMetadataFunction}from"remotion";
const calculateMetadata:CalculateMetadataFunction<Props>=async({props})=>{return{defaultCodec:"vp9",defaultVideoImageFormat:"png",defaultPixelFormat:"yuva420p"};};
<Composition id="my-video" component={MyVideo} durationInFrames={150} fps={30} width={1920} height={1080} calculateMetadata={calculateMetadata}/>;
```
