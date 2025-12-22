/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

// Declare Vite's ?raw import syntax
declare module '*?raw' {
  const content: string;
  export default content;
}
