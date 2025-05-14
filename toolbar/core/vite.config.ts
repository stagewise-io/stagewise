// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar vite config
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact({
      reactAliasesEnabled: true,
    }),
    dts({ rollupTypes: true }),
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
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/, /\@stagewise\/extension-toolbar-srpc-contract/],
      requireReturnsDefault: 'auto',
    },
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'plugin-ui': resolve(__dirname, 'src/plugin-ui/index.tsx'),
        'plugin-ui/jsx-runtime': resolve(
          __dirname,
          'src/plugin-ui/jsx-runtime.ts',
        ),
      },
      name: 'StagewiseToolbar',
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
        preserveModules: false,
        globals: {
          preact: 'Preact',
        },
      },
      treeshake: true,
    },
    minify: false,
    cssMinify: false,
  },
  optimizeDeps: {
    include: ['@stagewise/extension-toolbar-srpc-contract'],
    esbuildOptions: {
      mainFields: ['module', 'main'],
    },
  },
});
