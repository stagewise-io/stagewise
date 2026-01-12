import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'node',
  // Tailwind is a peer dep; keep it external in the bundle output.
  external: ['tailwindcss', 'tailwindcss/plugin'],
});
