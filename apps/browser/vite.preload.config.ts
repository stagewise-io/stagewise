import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      formats: ['es'],
      entry: 'src/preload.ts',
      name: 'preload',
      fileName: 'preload',
    },
  },
});
