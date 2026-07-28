import CursorLogo from './cursor.png';
import TraeLogo from './trae.png';
import VSCodeLogo from './vscode.png';
import WindsurfLogo from './windsurf.png';
import ZedLogo from './zed.png';
import KiroLogo from './kiro.png';
import type { ExternalIde } from '@shared/karton-contracts/ui/shared-types';

/**
 * Mapping of IDE identifiers to their logo image URLs (inlined as data URIs by Vite)
 */
export const IDE_LOGOS: Record<ExternalIde, string> = {
  vscode: VSCodeLogo,
  cursor: CursorLogo,
  windsurf: WindsurfLogo,
  trae: TraeLogo,
  zed: ZedLogo,
  kiro: KiroLogo,
};
