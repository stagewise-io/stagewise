import CursorLogo from './cursor.png';
import TraeLogo from './trae.png';
import VSCodeLogo from './vscode.png';
import WindsurfLogo from './windsurf.png';
import ZedLogo from './zed.png';
import KiroLogo from './kiro.png';
import FileIcon from './file.png';
import type { IDE_SELECTION_ITEMS } from '@/utils';

/**
 * Mapping of IDE identifiers to their logo image URLs (inlined as data URIs by Vite)
 */
export const IDE_LOGOS: Record<keyof typeof IDE_SELECTION_ITEMS, string> = {
  vscode: VSCodeLogo,
  cursor: CursorLogo,
  windsurf: WindsurfLogo,
  trae: TraeLogo,
  zed: ZedLogo,
  kiro: KiroLogo,
  other: FileIcon,
};
