Measure text with `@remotion/layout-utils`.

Use `measureText()` for text width + height.

```tsx
import{measureText}from"@remotion/layout-utils";const{width,height}=measureText({text:"Hello World",fontFamily:"Arial",fontSize:32,fontWeight:"bold"});
```

Results cached. Same call returns cached result.

## Fitting text to a width with `fitText()`

```tsx
import{fitText}from"@remotion/layout-utils";const{fontSize}=fitText({text:"Hello World",withinWidth:600,fontFamily:"Inter",fontWeight:"bold"});return<div style={{fontSize:Math.min(fontSize, 80),fontFamily:"Inter",fontWeight:"bold"}}>Hello World</div>;
```

## Checking text overflow with `fillTextBox()`

```tsx
import{fillTextBox}from"@remotion/layout-utils";const box=fillTextBox({maxBoxWidth:400,maxLines:3});const words=["Hello","World","This","is","a","test"];for(const word of words){const{exceedsBox}=box.add({text:word+" ",fontFamily:"Arial",fontSize:24});if(exceedsBox){break}}
```

## Best practices

**Load fonts first:** Only measure after fonts loaded.

```import{loadFont}from"@remotion/google-fonts/Inter";const{fontFamily,waitUntilDone}=loadFont("normal",{weights:["400"],subsets:["latin"]});waitUntilDone().then(()=>{const{width}=measureText({text:"Hello",fontFamily,fontSize:32})});```

**Use `validateFontIsLoaded`:** Catch font load issues early.

```measureText({text: "Hello",fontFamily:"MyCustomFont",fontSize:32,validateFontIsLoaded:true});```

**Match font properties:** Use same props for measurement and render.

```const fontStyle={fontFamily:"Inter",fontSize:32,fontWeight:"bold"as const,letterSpacing:"0.5px"};const{width}=measureText({text:"Hello",...fontStyle});return<div style={fontStyle}>Hello</div>;```

**Avoid padding and border:** Use `outline`, not `border`, to avoid layout mismatch.

```<div style={{outline:"2px solid red"}}>Text</div>```
