import { useKartonState } from '@/hooks/use-karton';
import { useEffect } from 'react';

export function TitleManager() {
  const authStatus = useKartonState((s) => s.userAccount.status);
  const workspace = useKartonState((s) => s.workspace);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      document.title = 'Sign in | stagewise';
    } else if (workspace === null) {
      document.title = 'Open Workspace | stagewise';
    } else if (workspace.setupActive) {
      document.title = 'Setup Workspace | stagewise';
    } else {
      const workspaceName =
        workspace.path.split('/').pop() ?? 'Untitled Workspace';
      document.title = `${workspaceName} | stagewise`;
    }
  }, [authStatus, workspace]);

  return null;
}
