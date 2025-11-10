import { useCallback, useEffect, useState } from 'react';
import { useKartonProcedure, useKartonState } from './use-karton';
import { getIDEFileUrl } from '@/utils';

export function useFileHref() {
  const getAbsoluteAgentAccessPath = useKartonProcedure(
    (p) => p.workspace.getAbsoluteAgentAccessPath,
  );

  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);

  const [absoluteAccessPath, setAbsoluteAccessPath] = useState<string | null>(
    null,
  );

  useEffect(() => {
    getAbsoluteAgentAccessPath().then((path) => {
      setAbsoluteAccessPath(path);
    });
  }, [getAbsoluteAgentAccessPath]);

  const getFileHref = useCallback(
    (relativeFilePath: string) => {
      if (!absoluteAccessPath) return '#';
      return getIDEFileUrl(
        absoluteAccessPath.replace('\\', '/') +
          '/' +
          relativeFilePath.replace('\\', '/'),
        openInIdeChoice,
      );
    },
    [absoluteAccessPath, openInIdeChoice],
  );

  return {
    getFileHref,
  };
}
