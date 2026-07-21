import fs from 'node:fs';
import path from 'node:path';

const RESET_MARKER = '.reset-app-data';

export function requestAppDataReset(userDataDirectory: string): void {
  fs.writeFileSync(path.join(userDataDirectory, RESET_MARKER), '');
}

export function applyPendingAppDataReset(userDataDirectory: string): void {
  const markerPath = path.join(userDataDirectory, RESET_MARKER);
  if (!fs.existsSync(markerPath)) return;

  const identityPath = path.join(
    userDataDirectory,
    'stagewise',
    'identity.json',
  );
  const identity = fs.readFileSync(identityPath);

  fs.rmSync(userDataDirectory, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, identity);
}
