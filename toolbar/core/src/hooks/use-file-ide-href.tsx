import { useCallback, useEffect, useState } from 'react';
import { useKartonProcedure, useKartonState } from './use-karton';
import { getIDEFileUrl } from '@/utils';

export function useFileIDEHref() {
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

  const getFileIDEHref = useCallback(
    (relativeFilePath: string, lineNumber?: number) => {
      if (!absoluteAccessPath) return '#';
      return getIDEFileUrl(
        absoluteAccessPath.replace('\\', '/') +
          '/' +
          relativeFilePath.replace('\\', '/'),
        openInIdeChoice,
        lineNumber,
      );
    },
    [absoluteAccessPath, openInIdeChoice],
  );

  return {
    getFileIDEHref,
  };
}
