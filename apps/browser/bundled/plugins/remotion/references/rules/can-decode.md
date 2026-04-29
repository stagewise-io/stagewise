Use Mediabunny to check if browser can decode video before play.

Install right Mediabunny version:

```bash
npx remotion add mediabunny
```

## `canDecode()`

Can copy-paste into any project.

```tsx
import{Input,ALL_FORMATS,UrlSource}from"mediabunny";
export const canDecode=async(src:string)=>{const input=new Input({formats:ALL_FORMATS,source:new UrlSource(src,{getRetryDelay:()=>null})});try{await input.getFormat()}catch{return false}const videoTrack=await input.getPrimaryVideoTrack();
if(videoTrack&&!(await videoTrack.canDecode())){return false}const audioTrack=await input.getPrimaryAudioTrack();if(audioTrack&&!(await audioTrack.canDecode())){return false}return true};
```

## Usage

```tsx
const src="https://remotion.media/video.mp4";const isDecodable=await canDecode(src);if(isDecodable){console.log("Video can be decoded")}else{console.log("Video cannot be decoded by this browser")}
```

## With Blob

For upload or drag-drop, use `BlobSource`.

```tsx
import{Input,ALL_FORMATS,BlobSource}from"mediabunny";
export const canDecodeBlob=async(blob:Blob)=>{
    const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob)})
    // Then: Same validation logic as above
};
```
