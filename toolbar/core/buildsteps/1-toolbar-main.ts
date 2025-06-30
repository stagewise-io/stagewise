import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { build } from 'vite';

const mode = process.argv[2];

export default async function buildToolbarMain() {
  await build({
    mode: mode,
    plugins: [react()],
    define: {
      'process.env': {},
    },
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src'),
      },
      mainFields: ['module', 'main'],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    esbuild: {
      minifyIdentifiers: false,
      treeShaking: mode === 'production',
    },
    build: {
      outDir: resolve(process.cwd(), 'tmp/toolbar-main'),
      commonjsOptions: {
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto',
      },
      lib: {
        entry: resolve(process.cwd(), 'src/index.ts'),
        name: 'StagewiseToolbar',
        fileName: 'index',
        formats: ['es'],
      },
      sourcemap: mode === 'development' ? 'inline' : false,
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
        ],
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
          preserveModules: false,
          globals: {
            react: 'React',
            'react-dom': 'React-dom',
          },
        },
        treeshake: mode === 'production',
      },
      minify: mode === 'production',
      cssMinify: mode === 'production',
    },
    optimizeDeps: {
      include: [
        '@trpc/client',
        '@stagewise/agent-interface',
        'lucide-react',
        'zod',
        '@headlessui/react',
      ],
      esbuildOptions: {
        mainFields: ['module', 'main'],
        minify: mode === 'production',
        treeShaking: mode === 'production',
      },
    },
  });
}
