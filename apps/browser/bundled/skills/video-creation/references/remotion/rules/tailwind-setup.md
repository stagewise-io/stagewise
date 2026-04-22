1. Install `tailwindcss` and `@remotion/tailwind-v4` JS packages
2. In `remotion.config.ts`, integrate (example: ```import{Config}from'@remotion/cli/config';import{enableTailwind}from'@remotion/tailwind-v4';Config.overrideWebpackConfig((currentConfiguration)=>{return enableTailwind(currentConfiguration);});```)
3. In root css (`index.css`): ```@import 'tailwindcss';```
4. `package.json` must NOT have `"sideEffects":false`. If it has, include css files in array, like: ```{"sideEffects":["*.css"]}```
