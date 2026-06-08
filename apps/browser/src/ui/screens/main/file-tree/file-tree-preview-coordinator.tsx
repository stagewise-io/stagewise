import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useEffect, useRef } from 'react';
import { useContentCollapsed } from '../_components/content-collapsed-context';

const PREVIEW_DEBOUNCE_MS = 80;

type FileTreePreviewCoordinatorProps = {
  workspaceKey: string | null;
  previewTargetPath: string | null;
  groupKey: string;
  onPreviewTargetClose: () => void;
};

export function FileTreePreviewCoordinator({
  workspaceKey,
  previewTargetPath,
  groupKey,
  onPreviewTargetClose,
}: FileTreePreviewCoordinatorProps) {
  const [openAgent] = useOpenAgent();
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();
  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const timerRef = useRef<number | null>(null);
  const latestTargetRef = useRef(previewTargetPath);
  const previousPreviewTargetRef = useRef<string | null>(previewTargetPath);
  latestTargetRef.current = previewTargetPath;

  const activePreviewTab = useKartonState(
    useComparingSelector((s) => {
      const entry = Object.entries(s.contentTabs.tabs).find(([, tab]) => {
        return (
          tab.type === 'file' &&
          tab.lifecycle.kind === 'temporary' &&
          tab.lifecycle.groupKey === groupKey &&
          tab.agentInstanceId === (openAgent ?? null)
        );
      });
      const [id, tab] = entry ?? [];
      if (!id || tab?.type !== 'file' || !tab.file) return null;
      return {
        id,
        workspaceKey: tab.file.workspaceKey,
        relativePath: tab.file.relativePath,
      };
    }),
  );
  const targetPermanentTab = useKartonState(
    useComparingSelector((s) => {
      if (!workspaceKey || !previewTargetPath) return null;
      const entry = Object.entries(s.contentTabs.tabs).find(([, tab]) => {
        return (
          tab.type === 'file' &&
          tab.lifecycle.kind === 'permanent' &&
          tab.agentInstanceId === (openAgent ?? null) &&
          tab.file?.workspaceKey === workspaceKey &&
          tab.file.relativePath === previewTargetPath
        );
      });
      return entry ? { id: entry[0] } : null;
    }),
  );

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const previousPreviewTarget = previousPreviewTargetRef.current;
    const targetChanged = previousPreviewTarget !== previewTargetPath;
    previousPreviewTargetRef.current = previewTargetPath;

    if (!workspaceKey || !previewTargetPath) {
      if (activePreviewTab) void closeTab(activePreviewTab.id);
      return;
    }

    if (contentCollapsed) setContentCollapsed(false);

    if (targetPermanentTab) {
      if (
        activePreviewTab &&
        (activePreviewTab.workspaceKey !== workspaceKey ||
          activePreviewTab.relativePath !== previewTargetPath)
      ) {
        void closeTab(activePreviewTab.id);
      }

      if (targetChanged) {
        void openFileTab(workspaceKey, previewTargetPath, openAgent, {
          preview: true,
          temporaryGroupKey: groupKey,
        });
      }
      return;
    }

    if (!activePreviewTab && !targetChanged) {
      onPreviewTargetClose();
      return;
    }

    if (
      activePreviewTab?.workspaceKey === workspaceKey &&
      activePreviewTab.relativePath === previewTargetPath
    ) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (latestTargetRef.current !== previewTargetPath) return;
      void openFileTab(workspaceKey, previewTargetPath, openAgent, {
        preview: true,
        temporaryGroupKey: groupKey,
      }).then((tabId) => {
        if (!tabId) void revealInFolder(workspaceKey, previewTargetPath);
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    activePreviewTab,
    closeTab,
    contentCollapsed,
    groupKey,
    openAgent,
    onPreviewTargetClose,
    openFileTab,
    previewTargetPath,
    revealInFolder,
    setContentCollapsed,
    targetPermanentTab,
    workspaceKey,
  ]);

  return null;
}
