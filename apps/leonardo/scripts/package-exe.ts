/**
 * Packages the bundled JS into a standalone Node.js SEA (Single Executable Application).
 *
 * Steps:
 *   1. Generate SEA blob from dist/index.js
 *   2. Copy the current Node.js binary
 *   3. Inject the blob with postject
 *   4. Strip debug symbols
 *   5. Code-sign the executable
 *   6. Notarize + staple (macOS only)
 *
 * Environment variables:
 *
 *   macOS signing + notarization:
 *     APPLE_SIGNING_IDENTITY  – e.g. "Developer ID Application: stagewise Inc. (TEAMID)"
 *     APPLE_ID                – Apple ID email for notarization
 *     APPLE_PASSWORD          – App-specific password for notarization
 *     APPLE_TEAM_ID           – 10-char Apple Developer Team ID
 *
 *   Windows signing (Azure Trusted Signing):
 *     SIGNTOOL_PATH           – Path to signtool.exe (Windows SDK)
 *     AZURE_CODE_SIGNING_DLIB – Path to Azure.CodeSigning.Dlib.dll
 *     AZURE_METADATA_JSON     – Path to metadata.json with Azure TS config
 *
 *   Set none of these → ad-hoc sign on macOS, skip on Windows (local dev).
 *
 * Usage:
 *   tsx scripts/package-exe.ts
 *   tsx scripts/package-exe.ts --skip-notarize   (sign but don't notarize)
 */

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const BLOB = join(DIST, 'sea-prep.blob');
const EXE_NAME = process.platform === 'win32' ? 'leonardo.exe' : 'leonardo';
const EXE_PATH = join(DIST, EXE_NAME);

const skipNotarize = process.argv.includes('--skip-notarize');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, opts?: { cwd?: string }): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: opts?.cwd ?? ROOT });
}

function env(name: string): string | undefined {
  return process.env[name];
}

// ---------------------------------------------------------------------------
// 1. Generate SEA blob
// ---------------------------------------------------------------------------
console.log('\n=== 1. Generating SEA blob ===');
if (!existsSync(join(DIST, 'index.js'))) {
  throw new Error('dist/index.js not found — run `pnpm build` first');
}
run('node --experimental-sea-config sea-config.json');

if (!existsSync(BLOB)) {
  throw new Error('SEA blob generation failed');
}

// ---------------------------------------------------------------------------
// 2. Copy node binary
// ---------------------------------------------------------------------------
console.log('\n=== 2. Copying Node.js binary ===');
const nodeBin = process.execPath;
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
copyFileSync(nodeBin, EXE_PATH);
chmodSync(EXE_PATH, 0o755);

// ---------------------------------------------------------------------------
// 3. Remove existing signature (macOS — required before injection)
// ---------------------------------------------------------------------------
if (process.platform === 'darwin') {
  console.log('\n=== 3. Removing existing code signature ===');
  run(`codesign --remove-signature "${EXE_PATH}"`);
}

// ---------------------------------------------------------------------------
// 4. Inject SEA blob
// ---------------------------------------------------------------------------
console.log('\n=== 4. Injecting SEA blob ===');

const postjectArgs = [
  `"${EXE_PATH}"`,
  'NODE_SEA_BLOB',
  `"${BLOB}"`,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];

if (process.platform === 'darwin') {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}

run(`npx postject ${postjectArgs.join(' ')}`);

// ---------------------------------------------------------------------------
// 5. Strip debug symbols (reduces binary ~20%)
// ---------------------------------------------------------------------------
if (process.platform === 'darwin') {
  console.log('\n=== 5. Stripping debug symbols (macOS) ===');
  run(`strip -x "${EXE_PATH}"`);
} else if (process.platform === 'linux') {
  console.log('\n=== 5. Stripping debug symbols (Linux) ===');
  run(`strip --strip-unneeded "${EXE_PATH}"`);
} else {
  console.log('\n=== 5. Stripping: skipped (Windows — not needed) ===');
}

// ---------------------------------------------------------------------------
// 6. Code signing
// ---------------------------------------------------------------------------
if (process.platform === 'darwin') {
  signMacOS();
} else if (process.platform === 'win32') {
  signWindows();
} else {
  console.log('\n=== 6. Signing: skipped (Linux) ===');
}

// ---------------------------------------------------------------------------
// 7. Notarization (macOS only)
// ---------------------------------------------------------------------------
if (process.platform === 'darwin' && !skipNotarize) {
  notarizeMacOS();
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log(`\n✅ Standalone executable: ${EXE_PATH}`);
console.log(`   Run with: ./dist/${EXE_NAME}`);

// ===========================================================================
// macOS signing
// ===========================================================================
function signMacOS(): void {
  const identity = env('APPLE_SIGNING_IDENTITY');

  if (identity) {
    console.log(`\n=== 6. Signing (macOS — identity: ${identity}) ===`);
  } else {
    console.log('\n=== 6. Signing (macOS — ad-hoc, no identity set) ===');
  }

  // Generate a minimal entitlements file for hardened runtime.
  // The SEA binary needs at least:
  //   - allow-jit: V8 JIT compiler
  //   - allow-unsigned-executable-memory: Node.js internals
  //   - disable-library-validation: dynamic import() of plugins from disk
  const entitlements = join(DIST, 'entitlements.plist');
  writeFileSync(
    entitlements,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
`,
  );

  const signArgs = [
    '--force',
    '--options',
    'runtime', // hardened runtime — required for notarization
    '--entitlements',
    `"${entitlements}"`,
    '--sign',
    `"${identity ?? '-'}"`, // "-" = ad-hoc
    `"${EXE_PATH}"`,
  ];

  run(`codesign ${signArgs.join(' ')}`);

  // Verify signature
  console.log('Verifying signature...');
  run(`codesign --verify --deep --strict --verbose=2 "${EXE_PATH}"`);
}

// ===========================================================================
// macOS notarization
// ===========================================================================
function notarizeMacOS(): void {
  const appleId = env('APPLE_ID');
  const applePassword = env('APPLE_PASSWORD');
  const teamId = env('APPLE_TEAM_ID');

  if (!appleId || !applePassword || !teamId) {
    console.log(
      '\n=== 7. Notarization: skipped (APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID not set) ===',
    );
    return;
  }

  console.log('\n=== 7. Notarizing with Apple ===');

  // notarytool requires a zip for standalone binaries (not .app bundles)
  const zipPath = join(DIST, 'leonardo-notarize.zip');
  run(`ditto -c -k --keepParent "${EXE_PATH}" "${zipPath}"`);

  // Submit for notarization and wait for result
  const submitArgs = [
    'xcrun notarytool submit',
    `"${zipPath}"`,
    `--apple-id "${appleId}"`,
    `--password "${applePassword}"`,
    `--team-id "${teamId}"`,
    '--wait', // block until Apple responds (typically 1-5 min)
  ];

  run(submitArgs.join(' '));

  // Staple the notarization ticket to the binary
  console.log('Stapling notarization ticket...');
  run(`xcrun stapler staple "${EXE_PATH}"`);

  // Clean up the zip
  run(`rm -f "${zipPath}"`);

  console.log('Notarization complete ✓');
}

// ===========================================================================
// Windows signing (Azure Trusted Signing — same approach as apps/browser)
// ===========================================================================
function signWindows(): void {
  const signtoolPath = env('SIGNTOOL_PATH');
  const dlibPath = env('AZURE_CODE_SIGNING_DLIB');
  const metadataPath = env('AZURE_METADATA_JSON');

  if (!signtoolPath || !dlibPath || !metadataPath) {
    console.log(
      '\n=== 6. Signing: skipped (SIGNTOOL_PATH / AZURE_CODE_SIGNING_DLIB / AZURE_METADATA_JSON not set) ===',
    );
    return;
  }

  console.log('\n=== 6. Signing (Windows — Azure Trusted Signing) ===');

  const signArgs = [
    `"${signtoolPath}"`,
    'sign',
    '/fd',
    'sha256',
    '/tr',
    'http://timestamp.acs.microsoft.com',
    '/td',
    'sha256',
    `/dlib "${dlibPath}"`,
    `/dmdf "${metadataPath}"`,
    `"${EXE_PATH}"`,
  ];

  run(signArgs.join(' '));

  // Verify
  console.log('Verifying signature...');
  run(`"${signtoolPath}" verify /pa "${EXE_PATH}"`);
}
