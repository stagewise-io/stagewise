import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { defineBuildConfig } from 'unbuild';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function copyRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getLatestVersion(pkg: string) {
  try {
    return execSync(`npm view ${pkg} version`).toString().trim();
  } catch (e) {
    console.error(`Could not fetch latest version for ${pkg}`);
    return null;
  }
}

function getLocalToolbarVersion() {
  // Adjust the path if your toolbar package is elsewhere
  const toolbarPkgPath = path.resolve(
    __dirname,
    '../../toolbar/core/package.json',
  );
  if (!fs.existsSync(toolbarPkgPath)) {
    console.warn('Could not find toolbar/core/package.json');
    return null;
  }
  const toolbarPkg = JSON.parse(fs.readFileSync(toolbarPkgPath, 'utf-8'));
  return toolbarPkg.version ? `^${toolbarPkg.version}` : null;
}

function replaceWorkspaceWithLocalToolbarVersion(pkgJsonPath: string) {
  if (!fs.existsSync(pkgJsonPath)) return;
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  let changed = false;

  const toolbarVersion = getLocalToolbarVersion();

  [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ].forEach((depType) => {
    if (pkgJson[depType]) {
      for (const dep in pkgJson[depType]) {
        if (
          dep === '@stagewise/toolbar' &&
          pkgJson[depType][dep] === 'workspace:*' &&
          toolbarVersion
        ) {
          pkgJson[depType][dep] = toolbarVersion;
          changed = true;
        }
      }
    }
  });

  if (changed) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
    console.log(
      `Replaced \"@stagewise/toolbar\": \"workspace:*\" with \"${toolbarVersion}\" in ${pkgJsonPath}`,
    );
  }
}

export default defineBuildConfig({
  entries: ['src/index'],
  clean: true,
  rollup: {
    inlineDependencies: true,
    esbuild: {
      target: 'node18',
      minify: true,
    },
  },
  hooks: {
    'rollup:options'(_ctx, options) {
      options.plugins = [options.plugins];
    },
    'build:done'() {
      // Copy the template plugin to the dist folder
      const src = path.resolve(__dirname, '../../plugins/template');
      const dest = path.resolve(__dirname, './dist/template');
      copyRecursiveSync(src, dest);
      console.log(`Copied template from ${src} to ${dest}`);

      // Update the package.json in the copied template
      const pkgJsonPath = path.join(dest, 'package.json');
      replaceWorkspaceWithLocalToolbarVersion(pkgJsonPath);
    },
  },
});
