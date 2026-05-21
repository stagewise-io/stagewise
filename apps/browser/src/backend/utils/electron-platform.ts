import type { Platform } from '@shared/hotkeys';

export function getElectronHotkeyPlatform(): Platform {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}
