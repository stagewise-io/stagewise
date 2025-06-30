import buildToolbarMain from './buildsteps/1-toolbar-main.js';
import buildPluginUI from './buildsteps/2-plugin-ui.js';
import buildToolbarLoader from './buildsteps/3-toolbar-loader.js';
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to copy only .js and .d.ts files (not subdirectories)
async function copyJsAndDtsFiles(srcDir: string, destDir: string) {
  const files = await readdir(srcDir);

  for (const file of files) {
    const srcFilePath = path.join(srcDir, file);
    const fileStats = await stat(srcFilePath);

    // Only copy files (not directories) that end with .js or .d.ts
    if (
      fileStats.isFile() &&
      (file.endsWith('.js') || file.endsWith('.d.ts'))
    ) {
      const destFilePath = path.join(destDir, file);
      await cp(srcFilePath, destFilePath);
    }
  }
}

await rm(path.join(__dirname, './dist'), { recursive: true, force: true });

await buildToolbarMain();

await buildPluginUI();

await buildToolbarLoader();

const loaderSrcDir = path.join(__dirname, './tmp/toolbar-loader');
const loaderDestDir = path.join(__dirname, './dist');

await mkdir(loaderDestDir, { recursive: true });

await copyJsAndDtsFiles(loaderSrcDir, loaderDestDir);

console.log('Copied toolbar loader files to dist.');

const pluginUiSrcDir = path.join(__dirname, './tmp/plugin-ui');
const pluginUiDestDir = path.join(__dirname, './dist/plugin-ui');

await mkdir(pluginUiDestDir, { recursive: true });

await copyJsAndDtsFiles(pluginUiSrcDir, pluginUiDestDir);

console.log('Copied plugin ui files to dist.');
