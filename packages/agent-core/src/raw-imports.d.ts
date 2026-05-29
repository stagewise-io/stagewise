// Support for `import foo from './foo.sql?raw'` — resolved at build time by
// the esbuild `text` loader configured in `build.js`. The `?raw` suffix
// matches the Vite/Rollup convention; TypeScript needs this ambient
// declaration to typecheck the imports.
declare module '*?raw' {
  const content: string;
  export default content;
}
