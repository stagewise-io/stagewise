import type {
  ExternalIde,
  OpenFilesInIde,
} from '@shared/karton-contracts/ui/shared-types';
import { getCurrentPlatform } from '@shared/hotkeys';

export const nativeFileManagerLabel = (() => {
  const platform = getCurrentPlatform();
  if (platform === 'mac') return 'Finder';
  if (platform === 'windows') return 'Explorer';
  return 'File Manager';
})();

/**
 * Generates a `stagewise://open-folder-in-ide/` URL. The backend handler
 * reads the directory, finds the first file alphabetically, and opens it
 * in the target IDE. If the folder is empty, it reveals in the native
 * file manager instead.
 */
export const getFolderIDEUrl = (
  absFolderPath: string,
  ide: OpenFilesInIde,
): string => {
  const clean = absFolderPath.endsWith('/')
    ? absFolderPath.slice(0, -1)
    : absFolderPath;
  return `stagewise://open-folder-in-ide/${clean}?ide=${ide}`;
};

export const IDE_SELECTION_ITEMS: Record<OpenFilesInIde, string> = {
  cursor: 'Cursor',
  vscode: 'VS Code',
  zed: 'Zed',
  kiro: 'Kiro',
  windsurf: 'Windsurf',
  trae: 'Trae',
  fileManager: nativeFileManagerLabel,
};

export const SUPPORTED_IDES = Object.keys(IDE_SELECTION_ITEMS).filter(
  (ide) => ide !== 'fileManager',
) as ExternalIde[];

export const getIDEFileUrl = (
  absFilePath: string,
  ide: OpenFilesInIde,
  lineNumber?: number,
) => {
  let url: string;
  switch (ide) {
    case 'vscode':
      url = `vscode://file/${absFilePath}`;
      break;
    case 'cursor':
      url = `cursor://file/${absFilePath}`;
      break;
    case 'windsurf':
      url = `windsurf://file/${absFilePath}`;
      break;
    case 'trae':
      url = `trae://file/${absFilePath}`;
      break;
    case 'zed':
      url = `zed://file/${absFilePath}`;
      break;
    case 'kiro':
      url = `kiro://file/${absFilePath}`;
      break;
    case 'fileManager':
      url = `stagewise://reveal-file/${encodeURIComponent(absFilePath)}`;
      break;
  }
  if (lineNumber) url += `:${lineNumber}`;

  return url;
};
