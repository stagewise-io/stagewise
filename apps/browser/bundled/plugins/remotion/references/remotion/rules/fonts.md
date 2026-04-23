## Google Fonts with @remotion/google-fonts

Best way for Google Fonts. Type-safe. Blocks render until font ready.

### Need

Install `@remotion/google-fonts`.

```import{loadFont}from"@remotion/google-fonts/Lobster";const{fontFamily}=loadFont();export const MyComposition=()=>{return <div style={{fontFamily}}>Hello World</div>;};```

Prefer only needed weights + subsets. Smaller file.

```import{loadFont}from"@remotion/google-fonts/Roboto";const{fontFamily}=loadFont("normal",{weights:["400","700"],subsets:["latin"]});```

### Wait for font load

Use `waitUntilDone()` if need know when font ready.

```import{loadFont}from"@remotion/google-fonts/Lobster";const{fontFamily,waitUntilDone}=loadFont();await waitUntilDone();```

## Local fonts with @remotion/fonts

For local font files, use `@remotion/fonts` (install if needed).

### Load local font

Put font file in `public/`. Use `loadFont()`.

```import{loadFont}from"@remotion/fonts";import{staticFile}from"remotion";await loadFont({family:"MyFont",url:staticFile("MyFont-Regular.woff2")});export const MyComposition=()=>{return <div style={{fontFamily:"MyFont"}}>Hello World</div>;};```

### Load many weights

Load each weight separate. Same family name.

```import{loadFont}from"@remotion/fonts";import{staticFile}from"remotion";await Promise.all([loadFont({family:"Inter",url:staticFile("Inter-Regular.woff2"),weight:"400"}),loadFont({family:"Inter",url:staticFile("Inter-Bold.woff2"),weight:"700"})]);```

### Options

```tsx
loadFont({
family: "MyFont", // Required: name used in CSS
url: staticFile("font.woff2"), // Required: font file URL
format: "woff2", // Optional: auto-detect from extension
weight: "400", // Optional: font weight
style: "normal", // Optional: normal or italic
display: "block", // Optional: font-display behavior
});
```

## Use in components

Call `loadFont()` at top level or in separate file imported early.

```tsx
import{loadFont}from"@remotion/google-fonts/Montserrat";const{fontFamily}=loadFont("normal",{weights:["400","700"],subsets:["latin"]});
export const Title:React.FC<{text:string}>=({text})=>{return <h1 style={{fontFamily,fontSize:80,fontWeight:"bold"}}>{text}</h1>;};
```
