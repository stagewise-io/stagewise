import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { build } from 'vite';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { generateDeclarationFile } from './utils.js';

const mode = process.argv[2];

export default async function buildPluginUI() {
  await build({
    mode: mode,
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src'),
      },
      mainFields: ['module', 'main'],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    esbuild: {
      minifyIdentifiers: false,
      treeShaking: true,
    },
    build: {
      outDir: resolve(process.cwd(), 'tmp/plugin-ui'),
      commonjsOptions: {
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto',
      },
      lib: {
        entry: {
          index: resolve(process.cwd(), 'src/plugin-ui/index.tsx'),
        },
        name: 'StagewiseToolbarPluginAPI',
        fileName: (format, entryName) => `${entryName}.${format}.js`,
        formats: ['es', 'cjs'],
      },
      sourcemap: mode === 'development' ? 'inline' : false,
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client'],
        output: {
          manualChunks: undefined,
          preserveModules: false,
          globals: {
            react: 'React',
          },
        },
        treeshake: mode === 'production',
      },
      minify: mode === 'production',
      cssMinify: mode === 'production',
    },
    optimizeDeps: {
      esbuildOptions: {
        mainFields: ['module', 'main'],
      },
    },
  });

  generateDeclarationFile(
    {
      [resolve(process.cwd(), 'src/plugin-ui/index.tsx')]: 'index',
    },
    resolve(process.cwd(), 'tmp/plugin-ui/unbundled-types'),
  );

  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    resolve(process.cwd(), 'api-extractor-configs/plugin-ui.json'),
  );

  Extractor.invoke(extractorConfig, {});
}
