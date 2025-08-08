import buildToolbarMain from './buildsteps/1-toolbar-main.js';
import buildPluginSdk from './buildsteps/2-plugin-sdk.js';
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

    // Only copy files (not directories) that end with .js, .d.ts
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

const mainSrcDir = path.join(__dirname, './tmp/toolbar-main');
const mainDestDir = path.join(__dirname, './dist/toolbar-main');

await mkdir(mainDestDir, { recursive: true });

await cp(mainSrcDir, mainDestDir, { recursive: true });

console.log('Copied toolbar main files to dist.');

await buildPluginSdk();

const pluginUiSrcDir = path.join(__dirname, './tmp/plugin-sdk');
const pluginUiDestDir = path.join(__dirname, './dist/plugin-sdk');
await mkdir(pluginUiDestDir, { recursive: true });

await copyJsAndDtsFiles(pluginUiSrcDir, pluginUiDestDir);

console.log('Copied plugin sdk files to dist.');
