import { useCallback } from 'react';
import { useKartonState } from '@/hooks/use-karton';
import { getIDEFileUrl } from '@/utils';

export function useFileIDEHref() {
  const accessPath = useKartonState((s) => s.workspace?.agent?.accessPath);
  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);

  const getFileIDEHref = useCallback(
    (relativeFilePath: string, lineNumber?: number) => {
      if (!accessPath) return '#';
      return getIDEFileUrl(
        accessPath.replace('\\', '/') +
          '/' +
          relativeFilePath.replace('\\', '/'),
        openInIdeChoice,
        lineNumber,
      );
    },
    [accessPath, openInIdeChoice],
  );

  return {
    getFileIDEHref,
  };
}
