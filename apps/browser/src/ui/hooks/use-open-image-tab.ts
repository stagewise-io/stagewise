import { useCallback } from 'react';
import { useKartonProcedure } from './use-karton';
import { useOpenAgent } from './use-open-chat';

export function useOpenImageTab() {
  const [openAgent] = useOpenAgent();
  const openImageTab = useKartonProcedure((p) => p.fileTree.openImageTab);

  return useCallback(
    (title: string, sourceUrl: string, mimeType = 'image/*') => {
      void openImageTab(title, sourceUrl, mimeType, openAgent);
    },
    [openAgent, openImageTab],
  );
}
