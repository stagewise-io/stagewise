import fs from 'node:fs';
import path from 'node:path';

export const ISOLATED_DEV_SEED_MARKER = '.isolated-dev-profile-seeded';

const SEEDED_FILE_NAMES = [
  'auth-session.json',
  'preferences.json',
  'credentials.json',
  'config.json',
  'identity.json',
  'onboarding-state.json',
  'tutorial-state.json',
  'recently-opened-workspaces.json',
];

export function seedIsolatedDevProfile(
  appDataDirectory: string,
  userDataDirectory: string,
  appBaseName: string,
): number {
  if (!appBaseName.startsWith('stagewise-dev-')) return 0;

  const markerPath = path.join(userDataDirectory, ISOLATED_DEV_SEED_MARKER);
  const sourceUserData = path.join(appDataDirectory, 'stagewise-dev');
  const sourceDataRoot = path.join(sourceUserData, 'stagewise');
  if (fs.existsSync(markerPath) || !fs.existsSync(sourceDataRoot)) return 0;

  const targetDataRoot = path.join(userDataDirectory, 'stagewise');
  fs.mkdirSync(targetDataRoot, { recursive: true });

  let copiedFileCount = 0;
  for (const fileName of SEEDED_FILE_NAMES) {
    const sourcePath = path.join(sourceDataRoot, fileName);
    const targetPath = path.join(targetDataRoot, fileName);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
    fs.copyFileSync(sourcePath, targetPath);
    copiedFileCount++;
  }

  if (process.platform === 'win32') {
    const sourcePath = path.join(sourceUserData, 'session', 'Local State');
    const targetPath = path.join(userDataDirectory, 'session', 'Local State');
    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      copiedFileCount++;
    }
  }

  fs.writeFileSync(markerPath, '');
  return copiedFileCount;
}
