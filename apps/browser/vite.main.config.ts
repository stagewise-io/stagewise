import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      formats: ['es'],
      entry: 'src/main.ts',
      name: 'main',
      fileName: 'main',
    },
  },
});
