import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import dts from 'vite-plugin-dts';
import react from '@vitejs/plugin-react-swc';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      rollupTypes: true,
    }) as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  esbuild: {
    minifyIdentifiers: false,
    treeShaking: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'StagewiseToolbarReact',
      fileName: 'index',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
        preserveModules: false,
        globals: {
          react: 'react',
          'react-dom': 'react-dom',
          '@stagewise/toolbar': '@stagewise/toolbar',
        },
      },
      external: ['@stagewise/toolbar', 'react', 'react-dom'],
      treeshake: true,
    },
    minify: false,
    cssMinify: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      mainFields: ['module', 'main'],
    },
  },
});
