// We're just building a default build script for plugins.
// People can extend or adapt the build process of the main plugin by simply passing in a vite config as a paremter
import { build, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import preserveDirectives from 'rollup-preserve-directives';
import { resolve } from 'node:path';
import fs from 'node:fs';

const mode = process.argv[2] || 'production';

export default async function buildPlugin(
  projectDir: string,
  config?: Partial<UserConfig>,
) {
  const __dirname = projectDir;
  // In the first build step, we're just bundling up the plugin itself to get one file that exports the plugin.
  // This build step can be adapted by passing in a vite config as a parameter.
  // We deep merge both configs and then build the plugin.

  // This kind of config can be overridden by the user by passing in a config object.
  const baseConfig: UserConfig = {
    mode: mode,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    esbuild: {
      minifyIdentifiers: mode === 'production',
      treeShaking: mode === 'production',
    },
    build: {
      rollupOptions: {
        treeshake: mode === 'production',
      },
      minify: mode === 'production',
      cssMinify: mode === 'production',
    },
  };

  // These parts of the config are forced by the plugin builder.
  const forcedConfig: UserConfig = {
    plugins: [react(), preserveDirectives()],
    resolve: {
      mainFields: ['module', 'main'],
    },
    build: {
      outDir: 'tmp/plugin',
      lib: {
        entry: resolve(process.cwd(), 'src/index.tsx'),
        name: 'StagewisePluginExample',
        fileName: (format) => `index.${format}.js`,
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        output: {
          manualChunks: undefined,
          preserveModules: false,
        },
        external: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
          '@stagewise/toolbar',
          '@stagewise/toolbar/plugin-ui',
        ],
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        mainFields: ['module', 'main'],
      },
    },
  };

  const mergedConfig: UserConfig = config
    ? mergeDeep(config, baseConfig, forcedConfig)
    : mergeDeep(baseConfig, forcedConfig);

  await build(mergedConfig);

  // Read the resulting file
  const pluginContent = fs.readFileSync(
    resolve(__dirname, 'tmp/plugin/index.es.js'),
    'utf8',
  );

  if (!fs.existsSync(resolve(__dirname, 'dist'))) {
    fs.mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
  }

  // create .js and .d.ts files in the output directory
  // Write CJS file
  fs.writeFileSync(
    resolve(__dirname, 'dist/index.cjs.js'),
    getLoaderContentCjs(pluginContent),
    'utf8',
  );

  // Write ESM file
  fs.writeFileSync(
    resolve(__dirname, 'dist/index.es.js'),
    getLoaderContentEs(pluginContent),
    'utf8',
  );

  // Write type definitions file
  fs.writeFileSync(
    resolve(__dirname, 'dist/index.d.ts'),
    loaderTypeContent,
    'utf8',
  );
}

function isObject(item: any): item is object {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function mergeDeep(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.hasOwn(source, key)) {
        if (isObject((source as any)[key])) {
          if (!(target as any)[key]) Object.assign(target, { [key]: {} });
          mergeDeep((target as any)[key], (source as any)[key]);
        } else {
          Object.assign(target, { [key]: (source as any)[key] });
        }
      }
    }
  }

  return mergeDeep(target, ...sources);
}

const getLoaderContentEs = (pluginContent: string) =>
  `'use client'

const plugin = {
    mainPlugin: ${JSON.stringify(pluginContent)},
    loader: true
}
    
export default plugin;
`;

const getLoaderContentCjs = (pluginContent: string) =>
  `"use client";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const plugin = {
    mainPlugin: ${JSON.stringify(pluginContent)},
    loader: true
}
exports.default = plugin;
`;

const loaderTypeContent = `import type { ToolbarPluginLoader } from '@stagewise/toolbar'
declare const plugin: ToolbarPluginLoader;
export default plugin;
`;
