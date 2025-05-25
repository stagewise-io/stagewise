// SPDX-License-Identifier: AGPL-3.0-only
// Tool Call Status Component
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

import { useState, useEffect } from 'preact/hooks';

interface ToolCallState {
  isActive: boolean;
  currentTask?: string;
  estimatedSteps?: number;
  progress?: {
    step: string;
    currentStep?: number;
    totalSteps?: number;
    details?: string;
  };
  status: 'starting' | 'in-progress' | 'completed' | 'error';
  result?: {
    success: boolean;
    message: string;
    filesModified?: string[];
  };
  error?: {
    error: string;
    context?: string;
    recoverable?: boolean;
  };
}

export function ToolCallStatus() {
  const [state, setState] = useState<ToolCallState>({
    isActive: false,
    status: 'starting',
  });

  // Listen for MCP notifications from the extension
  useEffect(() => {
    // This would be replaced with actual event listeners from the extension
    // For now, we'll simulate with a demo
    const handleMcpNotification = (data: any) => {
      switch (data.type) {
        case 'start':
          setState({
            isActive: true,
            currentTask: data.task,
            estimatedSteps: data.estimatedSteps,
            status: 'starting',
          });
          break;

        case 'progress':
          setState((prev) => ({
            ...prev,
            status: 'in-progress',
            progress: {
              step: data.step,
              currentStep: data.currentStep,
              totalSteps: data.totalSteps,
              details: data.details,
            },
          }));
          break;

        case 'completion':
          setState((prev) => ({
            ...prev,
            status: 'completed',
            result: {
              success: data.success,
              message: data.message,
              filesModified: data.filesModified,
            },
          }));
          // Auto-hide after 5 seconds on success
          if (data.success) {
            setTimeout(() => {
              setState((prev) => ({ ...prev, isActive: false }));
            }, 5000);
          }
          break;

        case 'error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: {
              error: data.error,
              context: data.context,
              recoverable: data.recoverable,
            },
          }));
          break;
      }
    };

    // TODO: Replace with actual event listener when extension integration is ready
    // window.addEventListener('stagewise-mcp-notification', handleMcpNotification);

    return () => {
      // window.removeEventListener('stagewise-mcp-notification', handleMcpNotification);
    };
  }, []);

  if (!state.isActive) {
    return null;
  }

  return (
    <div className="mx-4 mb-4 max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div className="flex items-start space-x-3">
        {/* Status Icon */}
        <div className="mt-1 flex-shrink-0">
          {state.status === 'starting' || state.status === 'in-progress' ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          ) : state.status === 'completed' ? (
            state.result?.success ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                <svg
                  className="h-3 w-3 text-white"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
                <svg
                  className="h-3 w-3 text-white"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
              <svg
                className="h-3 w-3 text-white"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center space-x-2">
            <h3 className="font-medium text-gray-900 text-sm">
              {state.status === 'starting' && 'AI Agent Starting'}
              {state.status === 'in-progress' && 'AI Agent Working'}
              {state.status === 'completed' &&
                (state.result?.success ? 'Task Completed' : 'Task Failed')}
              {state.status === 'error' && 'Error Occurred'}
            </h3>
          </div>

          {/* Task Description */}
          {state.currentTask && (
            <p className="mt-1 text-gray-600 text-sm">📋 {state.currentTask}</p>
          )}

          {/* Estimated Steps */}
          {state.estimatedSteps && state.status === 'starting' && (
            <p className="mt-1 text-gray-500 text-xs">
              ⏱️ Estimated: {state.estimatedSteps} steps
            </p>
          )}

          {/* Progress Information */}
          {state.progress && state.status === 'in-progress' && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-gray-700 text-sm">
                  {state.progress.currentStep && state.progress.totalSteps
                    ? `Step ${state.progress.currentStep}/${state.progress.totalSteps}: `
                    : ''}
                  {state.progress.step}
                </p>
              </div>

              {state.progress.details && (
                <p className="text-gray-500 text-xs">
                  💡 {state.progress.details}
                </p>
              )}

              {/* Progress Bar */}
              {state.progress.currentStep && state.progress.totalSteps && (
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${(state.progress.currentStep / state.progress.totalSteps) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Completion Result */}
          {state.result && state.status === 'completed' && (
            <div className="mt-2">
              <p className="text-gray-700 text-sm">{state.result.message}</p>
              {state.result.filesModified &&
                state.result.filesModified.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-gray-500 text-xs">
                      📁 Files modified:
                    </p>
                    <div className="space-y-1">
                      {state.result.filesModified.map((file, index) => (
                        <span
                          key={file}
                          className="mr-1 inline-block rounded bg-gray-100 px-2 py-1 text-xs"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Error Information */}
          {state.error && state.status === 'error' && (
            <div className="mt-2">
              <p className="text-red-700 text-sm">{state.error.error}</p>
              {state.error.context && (
                <p className="mt-1 text-gray-500 text-xs">
                  Context: {state.error.context}
                </p>
              )}
              {state.error.recoverable !== undefined && (
                <p className="mt-1 text-gray-500 text-xs">
                  {state.error.recoverable
                    ? '🔄 Recoverable error'
                    : '❌ Task aborted'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={() => setState((prev) => ({ ...prev, isActive: false }))}
          type="button"
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
