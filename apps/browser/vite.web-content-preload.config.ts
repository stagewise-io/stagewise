import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        dir: '.vite/build/web-content-preload',
      },
    },
  },
});
