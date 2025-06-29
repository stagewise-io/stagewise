import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./src/index.ts', './src/client.ts', './src/server.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
