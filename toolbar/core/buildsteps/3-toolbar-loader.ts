import { resolve } from 'node:path';
import { build } from 'vite';
import { generateDeclarationFile } from './utils.js';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const mode = process.argv[2];

export default async function buildToolbarLoader() {
  await build({
    mode: mode,
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src'),
        'tmp/toolbar-main': resolve(process.cwd(), 'tmp/toolbar-main'),
      },
      mainFields: ['module', 'main'],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    esbuild: {
      minifyIdentifiers: false,
      treeShaking: mode === 'production',
    },
    build: {
      outDir: resolve(process.cwd(), 'tmp/toolbar-loader'),
      commonjsOptions: {
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto',
      },
      lib: {
        entry: {
          index: resolve(process.cwd(), 'src/loader.ts'),
        },
        name: 'StagewiseToolbarLoader',
        fileName: (format, entryName) => `${entryName}.${format}.js`,
        formats: ['es', 'cjs'],
      },
      sourcemap: mode === 'development' ? 'inline' : false,
      rollupOptions: {
        output: {
          manualChunks: undefined,
          preserveModules: false,
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
    { [resolve(process.cwd(), 'src/loader.ts')]: 'index' },
    resolve(process.cwd(), 'tmp/toolbar-loader/unbundled-types'),
  );

  const _tsconfigForApiExtractor = {
    // Extend your original tsconfig to inherit basic compiler options
    extends: './tsconfig.json',
    compilerOptions: {
      // Crucially, set the baseUrl to the project root
      baseUrl: '.',
      // Override the paths to point '@/*' to the temporary d.ts folder
      paths: {
        '@/*': [`tmp/toolbar-loader/unbundled-types/*`],
      },
    },
    // IMPORTANT: Only include the .d.ts files from the tmp folder.
    // This prevents API Extractor from looking at your original .ts source files.
    include: [`tmp/toolbar-loader/unbundled-types/**/*.d.ts`],
    exclude: ['node_modules'],
  };

  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    resolve(process.cwd(), 'api-extractor-configs/loader.json'),
  );

  Extractor.invoke(extractorConfig, {});
}
