import { useCallback } from 'react';
import { getIDEFileUrl } from '@shared/ide-url';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';

type IdeConfig = {
  openFilesInIde: OpenFilesInIde;
};

export type UseFileIDEHrefOptions = {
  resolvePath: (relativePath: string) => string | null;
  ideConfig: IdeConfig;
  setIdeConfig: (config: IdeConfig) => Promise<void>;
};

export function useFileIDEHref({
  resolvePath,
  ideConfig,
  setIdeConfig,
}: UseFileIDEHrefOptions) {
  const getFileIDEHref = useCallback(
    (relativePath: string, lineNumber?: number) => {
      const absolutePath = resolvePath(relativePath);
      if (!absolutePath) return '#';
      return getIDEFileUrl(absolutePath, ideConfig.openFilesInIde, lineNumber);
    },
    [resolvePath, ideConfig.openFilesInIde],
  );

  const pickIdeAndOpen = useCallback(
    async (ide: OpenFilesInIde, relativePath: string, lineNumber?: number) => {
      await setIdeConfig({
        openFilesInIde: ide,
      });

      const absolutePath = resolvePath(relativePath);
      if (!absolutePath) return;
      const url = getIDEFileUrl(absolutePath, ide, lineNumber);
      window.open(url, '_blank');
    },
    [setIdeConfig, resolvePath],
  );

  return {
    getFileIDEHref,
    pickIdeAndOpen,
    resolvePath,
  };
}
