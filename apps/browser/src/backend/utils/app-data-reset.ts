import fs from 'node:fs';
import path from 'node:path';

const RESET_MARKER = '.reset-app-data';

export function requestAppDataReset(userDataDirectory: string): void {
  fs.writeFileSync(path.join(userDataDirectory, RESET_MARKER), '');
}

export function applyPendingAppDataReset(userDataDirectory: string): void {
  const markerPath = path.join(userDataDirectory, RESET_MARKER);
  if (!fs.existsSync(markerPath)) return;
  const removeOptions = { recursive: true, force: true };

  for (const entry of fs.readdirSync(userDataDirectory)) {
    if (
      entry === RESET_MARKER ||
      entry === 'stagewise' ||
      entry.startsWith('Singleton')
    )
      continue;
    fs.rmSync(path.join(userDataDirectory, entry), removeOptions);
  }

  const dataRoot = path.join(userDataDirectory, 'stagewise');
  if (fs.existsSync(dataRoot))
    for (const entry of fs.readdirSync(dataRoot)) {
      if (entry !== 'identity.json')
        fs.rmSync(path.join(dataRoot, entry), removeOptions);
    }

  fs.rmSync(markerPath);
}
