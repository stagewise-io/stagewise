To make video parametrizable, add Zod schema to composition.

Make sure `zod` is installed with package manager.

Then define Zod schema next to component.

```tsx
import{z}from"zod";export const MyCompositionSchema=z.object({title:z.string()});const MyComponent:React.FC<z.infer<typeof MyCompositionSchema>>=(props)=>{return<div><h1>{props.title}</h1></div>};
```

In root file, pass schema to composition.

```tsx
import{Composition}from"remotion";import{MyComponent,MyCompositionSchema}from"./MyComposition";export const RemotionRoot=()=>{return<Composition id="MyComposition" component={MyComponent} durationInFrames={100} fps={30} width={1080} height={1080} defaultProps={{title:"Hello World"}} schema={MyCompositionSchema}/>};
```

Then user can edit parameter visually in sidebar.

If Zod supports schema, Remotion supports schema.

Top-level type MUST be `z.object()`. React props bag always object.

## Color picker

For color picker, use `zColor()` from `@remotion/zod-types` (install if needed).

Then import `zColor` and use in schema

```tsx
import{zColor}from"@remotion/zod-types";
export const MyCompositionSchema=z.object({color:zColor()});
```
