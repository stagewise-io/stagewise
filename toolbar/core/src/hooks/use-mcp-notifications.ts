// SPDX-License-Identifier: AGPL-3.0-only
// MCP Notifications Hook
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

import { useEffect } from 'preact/hooks';
import { useAppState } from './use-app-state';

interface McpNotificationEvent {
  type: 'start' | 'progress' | 'completion' | 'error';
  data: any;
}

/**
 * Hook to listen for MCP notifications and update the app state
 * This integrates with the MCP tool call notifications from the extension
 */
export const useMcpNotifications = () => {
  const startMcpTask = useAppState((state) => state.startMcpTask);
  const updateMcpProgress = useAppState((state) => state.updateMcpProgress);
  const completeMcpTask = useAppState((state) => state.completeMcpTask);
  const errorMcpTask = useAppState((state) => state.errorMcpTask);

  useEffect(() => {
    const handleMcpNotification = (
      event: CustomEvent<McpNotificationEvent>,
    ) => {
      const { type, data } = event.detail;

      switch (type) {
        case 'start':
          console.log('[MCP Hook] Starting task:', data.task);
          startMcpTask(
            data.task,
            data.estimatedSteps,
            data.toolName,
            data.inputSchema,
            data.inputArguments,
          );
          break;

        case 'progress':
          console.log('[MCP Hook] Progress update:', data.step);
          updateMcpProgress(
            data.step,
            data.currentStep,
            data.totalSteps,
            data.details,
          );
          break;

        case 'completion':
          console.log('[MCP Hook] Task completed:', data.success);
          completeMcpTask(data.success, data.message, data.filesModified);
          break;

        case 'error':
          console.log('[MCP Hook] Task error:', data.error);
          errorMcpTask(data.error, data.context, data.recoverable);
          break;

        default:
          console.warn('[MCP Hook] Unknown notification type:', type);
      }
    };

    // Listen for MCP notifications
    window.addEventListener(
      'stagewise-mcp-notification',
      handleMcpNotification as EventListener,
    );

    return () => {
      window.removeEventListener(
        'stagewise-mcp-notification',
        handleMcpNotification as EventListener,
      );
    };
  }, [startMcpTask, updateMcpProgress, completeMcpTask, errorMcpTask]);
};
