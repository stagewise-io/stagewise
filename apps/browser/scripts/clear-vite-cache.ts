import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browserRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(browserRoot, '../..');

// Vite cacheDir is relative to the `root` config option in each vite config
// - vite.ui.config.ts: root=./src/ui, cacheDir=node_modules/.vite/ui
// - vite.pages.config.ts: root=./src/pages, cacheDir=node_modules/.vite/pages
const viteCacheDirs = [
  // UI renderer cache (where lucide-react is bundled)
  path.join(browserRoot, 'src', 'ui', 'node_modules', '.vite'),
  // Pages renderer cache
  path.join(browserRoot, 'src', 'pages', 'node_modules', '.vite'),
  // Fallback: browser root cache (backend/preload builds)
  path.join(browserRoot, 'node_modules', '.vite'),
];

// Check lucide-react version
const requiredVersion = '0.554.0';
let installedVersion: string | null = null;

try {
  const lucidePackageJson = path.join(
    browserRoot,
    'node_modules',
    'lucide-react',
    'package.json',
  );
  if (fs.existsSync(lucidePackageJson)) {
    const pkg = JSON.parse(fs.readFileSync(lucidePackageJson, 'utf-8'));
    installedVersion = pkg.version;
  }
} catch {
  installedVersion = null;
}

// Check for stale lucide-react versions in pnpm store that could cause resolution issues
const pnpmStore = path.join(monorepoRoot, 'node_modules', '.pnpm');
const staleVersionDirs: string[] = [];
if (fs.existsSync(pnpmStore)) {
  const entries = fs.readdirSync(pnpmStore);
  for (const entry of entries) {
    // Match lucide-react@X.X.X but NOT the required version
    if (
      entry.startsWith('lucide-react@') &&
      !entry.startsWith(`lucide-react@${requiredVersion}`)
    ) {
      staleVersionDirs.push(path.join(pnpmStore, entry));
      console.log(`⚠️  Found stale lucide-react version: ${entry}`);
    }
  }
}

// Track if we need to clear Vite cache (only when something changed)
let needsCacheClear = false;

// Delete stale versions from pnpm store
if (staleVersionDirs.length > 0) {
  console.log('🗑️  Removing stale lucide-react versions from pnpm store...');
  for (const staleDir of staleVersionDirs) {
    try {
      fs.rmSync(staleDir, { recursive: true, force: true });
      console.log(`   ✓ Removed: ${path.basename(staleDir)}`);
      needsCacheClear = true;
    } catch (error) {
      console.warn(`   ⚠ Failed to remove ${path.basename(staleDir)}:`, error);
    }
  }
}

// If version mismatch, reinstall dependencies
if (installedVersion !== requiredVersion) {
  console.log(
    `⚠️  lucide-react version mismatch: installed=${installedVersion}, required=${requiredVersion}`,
  );
  console.log('📦 Running pnpm install to fix dependencies...');
  try {
    execSync('pnpm install', { cwd: monorepoRoot, stdio: 'inherit' });
    console.log('✅ Dependencies updated');
    needsCacheClear = true;
  } catch (error) {
    console.error('❌ Failed to update dependencies:', error);
  }
}

// Only clear Vite cache if we removed stale versions or reinstalled dependencies
if (needsCacheClear) {
  console.log('🧹 Clearing Vite cache directories...');

  for (const cacheDir of viteCacheDirs) {
    if (fs.existsSync(cacheDir)) {
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`   ✓ Cleared: ${path.relative(browserRoot, cacheDir)}`);
      } catch (error) {
        console.warn(
          `   ⚠ Failed to clear ${path.relative(browserRoot, cacheDir)}:`,
          error,
        );
      }
    }
  }

  console.log(
    '✨ Stale dependencies cleaned up. Vite will re-bundle on start.',
  );
} else {
  console.log('✅ No stale lucide-react versions found. Skipping cache clear.');
}
