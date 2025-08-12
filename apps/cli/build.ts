#!/usr/bin/env node
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function extractLicenses() {
  console.log('Extracting licenses...');
  try {
    const { stdout } = await execAsync(
      'npx license-checker --json --excludePrivatePackages --production',
      { cwd: __dirname },
    );

    const licenses = JSON.parse(stdout);
    const licenseText = ['# Third-Party Licenses\n'];

    for (const [pkg, info] of Object.entries(licenses)) {
      const licenseInfo = info as any;
      licenseText.push(`## ${pkg}`);
      licenseText.push(`- License: ${licenseInfo.licenses || 'Unknown'}`);
      if (licenseInfo.repository) {
        licenseText.push(`- Repository: ${licenseInfo.repository}`);
      }
      if (licenseInfo.publisher) {
        licenseText.push(`- Publisher: ${licenseInfo.publisher}`);
      }
      licenseText.push('');
    }

    await writeFile('dist/THIRD_PARTY_LICENSES.txt', licenseText.join('\n'));
    console.log('License information saved to dist/THIRD_PARTY_LICENSES.txt');
  } catch (error) {
    console.warn('Failed to extract licenses:', error);
  }
}

async function buildCLI() {
  try {
    // Read package.json to get version
    const packageJson = JSON.parse(
      await readFile(resolve(__dirname, 'package.json'), 'utf-8'),
    );
    const version = packageJson.version;

    // Ensure dist directory exists
    await mkdir('dist', { recursive: true });

    // Only keep external the packages that have issues with bundling
    const externalPackages: string[] = [];

    // Build the CLI bundling most dependencies
    const result = await build({
      entryPoints: [resolve(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: 'dist/index.cjs',
      banner: {
        js: `#!/usr/bin/env node
// This file bundles most dependencies. See THIRD_PARTY_LICENSES.txt for license information.

const import_meta_url = require('url').pathToFileURL(__filename).href;
`,
      },
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        ...externalPackages,
      ],
      // Define environment variables
      define: {
        'process.env.NODE_ENV': JSON.stringify(
          process.env.NODE_ENV || 'production',
        ),
        'import.meta.url': `import_meta_url`,
        'process.env.CLI_VERSION': JSON.stringify(version),
        'process.env.POSTHOG_API_KEY': JSON.stringify(
          process.env.POSTHOG_API_KEY,
        ),
        'process.env.POSTHOG_HOST': JSON.stringify(
          process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        ),
        'process.env.STAGEWISE_CONSOLE_URL': JSON.stringify(
          process.env.STAGEWISE_CONSOLE_URL ?? 'https://console.stagewise.io',
        ),
        'process.env.API_URL': JSON.stringify(
          process.env.API_URL ?? 'https://v1.api.stagewise.io',
        ),
      },
      sourcemap: true,
      minify: process.env.NODE_ENV === 'production',
      // Handle packages that use require() internally
      mainFields: ['module', 'main'],
      conditions: ['module', 'import', 'default'],
      // Allow top-level await
      supported: {
        'top-level-await': true,
      },
      // Keep imports for better debugging
      keepNames: true,
      // Log metadata about the build
      metafile: true,
    });

    // Save build metadata for debugging
    await writeFile(
      'dist/build-meta.json',
      JSON.stringify(result.metafile, null, 2),
    );

    // Extract licenses after build
    await extractLicenses();

    // Run copy operations in parallel
    await Promise.all([
      // Copy toolbar dist to CLI dist
      copyToolbarDist(),

      // Copy toolbar-bridged dist to CLI dist
      copyToolbarBridgedDist(),

      // Copy bundled plugins to CLI dist
      copyBundledPlugins(),
    ]);

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function copyToolbarDist() {
  const toolbarDistPath = resolve(
    __dirname,
    '../../toolbar/core/dist/toolbar-main',
  );
  const targetPath = resolve(__dirname, 'dist/toolbar-app');

  // Check if toolbar dist exists
  if (!existsSync(toolbarDistPath)) {
    throw new Error(
      'Toolbar dist not found. Make sure to build @stagewise/toolbar first.',
    );
  }

  // Create target directory
  await mkdir(targetPath, { recursive: true });

  // Copy toolbar dist contents
  await cp(toolbarDistPath, targetPath, { recursive: true });

  console.log('Copied toolbar dist to dist/toolbar-app');
}

async function copyToolbarBridgedDist() {
  const toolbarDistPath = resolve(
    __dirname,
    '../../toolbar/bridged/dist/toolbar-main',
  );
  const targetPath = resolve(__dirname, 'dist/toolbar-bridged');

  // Check if toolbar dist exists
  if (!existsSync(toolbarDistPath)) {
    throw new Error(
      'Toolbar bridged dist not found. Make sure to build @stagewise/toolbar-bridged first.',
    );
  }

  // Create target directory
  await mkdir(targetPath, { recursive: true });

  // Copy toolbar dist contents
  await cp(toolbarDistPath, targetPath, { recursive: true });

  console.log('Copied toolbar dist to dist/toolbar-bridged');
}

async function copyBundledPlugins() {
  const bundledPlugins = ['react', 'angular', 'vue'];
  const pluginsTargetPath = resolve(__dirname, 'dist/plugins');

  // Create plugins directory
  await mkdir(pluginsTargetPath, { recursive: true });

  // Copy each bundled plugin
  for (const pluginName of bundledPlugins) {
    const pluginSourcePath = resolve(
      __dirname,
      `../../plugins/${pluginName}/dist`,
    );
    const pluginTargetPath = resolve(pluginsTargetPath, pluginName);

    // Check if plugin dist exists
    if (!existsSync(pluginSourcePath)) {
      throw new Error(
        `Plugin ${pluginName} dist not found at ${pluginSourcePath}. Make sure to build @stagewise-plugins/${pluginName} first.`,
      );
    }

    // Create target directory for this plugin
    await mkdir(pluginTargetPath, { recursive: true });

    // Copy plugin dist contents
    await cp(pluginSourcePath, pluginTargetPath, { recursive: true });

    console.log(`Copied ${pluginName} plugin to dist/plugins/${pluginName}`);
  }
}

buildCLI();
