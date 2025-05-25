// SPDX-License-Identifier: AGPL-3.0-only
// Draggable box component for the toolbar
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// This component represents the box in which the toolbar is placed.
// It is only used in desktop cases, since the mobile toolbar is placed inside a modal card.

import { Button } from '@headlessui/react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MessageCircleIcon,
  PuzzleIcon,
  RefreshCwIcon,
  WifiOffIcon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react';
import { ToolbarChatArea } from '../chat-box';
import { useDraggable } from '@/hooks/use-draggable';
import { useContext, useEffect } from 'preact/hooks';
import { DraggableContext } from '@/hooks/use-draggable';
import type { DraggableContextType } from '@/hooks/use-draggable';
import { usePlugins } from '@/hooks/use-plugins';
import { ToolbarSection } from '../section';
import { ToolbarButton } from '../button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { useAppState } from '@/hooks/use-app-state';
import { Logo } from '@/components/ui/logo';
import type { VNode } from 'preact';
import { SettingsButton, SettingsPanel } from '../settings';
import { useVSCode } from '@/hooks/use-vscode';

import { useState } from 'preact/hooks';

// Subcomponent for tool details (input schema and arguments)
function ToolDetailsSection({
  toolName,
  inputSchema,
  inputArguments,
}: {
  toolName?: string;
  inputSchema?: Record<string, any>;
  inputArguments?: Record<string, any>;
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!toolName && !inputSchema && !inputArguments) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-blue-300 bg-blue-100/50 p-2">
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex w-full items-center gap-2 font-medium text-blue-800 text-xs hover:text-blue-900"
      >
        <PuzzleIcon className="size-3" />
        <span>Tool Details{toolName && `: ${toolName}`}</span>
        <span className="ml-auto text-blue-600">
          {showDetails ? 'Hide' : 'Show'}
        </span>
      </button>

      {showDetails && (
        <div className="mt-2 space-y-2 border-blue-200 border-t pt-2">
          {toolName && (
            <div>
              <span className="font-medium text-blue-700 text-xs">Tool:</span>
              <code className="ml-1 rounded bg-blue-200 px-1 py-0.5 text-blue-800 text-xs">
                {toolName}
              </code>
            </div>
          )}

          {inputArguments && Object.keys(inputArguments).length > 0 && (
            <div>
              <span className="font-medium text-blue-700 text-xs">
                Input Arguments:
              </span>
              <div className="mt-1 max-h-32 overflow-y-auto rounded bg-blue-200/50 p-2">
                <pre className="text-blue-800 text-xs">
                  {JSON.stringify(inputArguments, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {inputSchema && Object.keys(inputSchema).length > 0 && (
            <div>
              <span className="font-medium text-blue-700 text-xs">
                Input Schema:
              </span>
              <div className="mt-1 max-h-32 overflow-y-auto rounded bg-blue-200/50 p-2">
                <pre className="text-blue-800 text-xs">
                  {JSON.stringify(inputSchema, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Subcomponent for loading state content
function LoadingStateContent() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <RefreshCwIcon className="size-5 animate-spin text-blue-600" />
        <h3 className="font-semibold text-blue-800">Connecting...</h3>
      </div>

      <div className="text-blue-700 text-sm">
        <p>Looking for VS Code windows...</p>
      </div>
    </div>
  );
}

// Enhanced completion state with MCP tool call integration
function CompletionStateContent({
  completionState,
  completionMessage,
  onReset,
}: {
  completionState: 'loading' | 'success' | 'error';
  completionMessage: string | null;
  onReset: () => void;
}) {
  // For backward compatibility, map old states to new enhanced UI
  // TODO: This will be replaced with actual MCP tool call state management

  if (completionState === 'loading') {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <h3 className="font-semibold text-blue-800">AI Agent Working</h3>
        </div>
        <div className="space-y-2 text-blue-700 text-sm">
          <p className="text-blue-600 text-sm">📋 Processing your request...</p>
          <p className="text-blue-500 text-xs">
            💡 The agent is analyzing and implementing changes
          </p>

          {/* Progress visualization for loading state */}
          <div className="mt-3 h-2 w-full rounded-full bg-blue-200">
            <div
              className="h-2 animate-pulse rounded-full bg-blue-500"
              style={{ width: '60%' }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (completionState === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-5 items-center justify-center rounded-full bg-green-500">
            <CheckCircleIcon className="size-3 text-white" />
          </div>
          <h3 className="font-semibold text-green-800">
            Task Completed Successfully
          </h3>
        </div>
        <div className="space-y-3 text-green-700 text-sm">
          <p className="text-green-700 text-sm">
            {completionMessage ||
              'The agent has completed your request successfully.'}
          </p>

          {/* Show completion details */}
          <div className="mt-2 space-y-2">
            <p className="text-green-600 text-xs">✅ Implementation finished</p>
            <p className="text-green-500 text-xs">
              📁 Files have been modified
            </p>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-green-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (completionState === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-5 items-center justify-center rounded-full bg-red-500">
            <XCircleIcon className="size-3 text-white" />
          </div>
          <h3 className="font-semibold text-red-800">Error Occurred</h3>
        </div>
        <div className="space-y-3 text-red-700 text-sm">
          <p className="text-red-700 text-sm">
            {completionMessage ||
              'The agent encountered an error while processing your request.'}
          </p>

          {/* Show error details */}
          <div className="mt-2">
            <p className="text-red-500 text-xs">
              ⚠️ Task could not be completed
            </p>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Enhanced MCP tool call status component
function McpToolCallStatusContent({
  mcpToolCall,
  onReset,
}: {
  mcpToolCall: any; // Using McpToolCallState from app state
  onReset: () => void;
}) {
  if (mcpToolCall.status === 'agent-reached') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="size-5 animate-pulse rounded-full bg-emerald-500" />
          <h3 className="font-semibold text-emerald-800">Agent Connected</h3>
        </div>
        <div className="space-y-2 text-emerald-700 text-sm">
          <p className="text-emerald-600 text-sm">
            ✅ Successfully reached the agent! Waiting for task to begin...
          </p>
          <p className="text-emerald-500 text-xs">
            🔄 The agent is preparing to start working on your request
          </p>
        </div>
      </div>
    );
  }

  if (mcpToolCall.status === 'starting') {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <h3 className="font-semibold text-blue-800">AI Agent Starting</h3>
        </div>
        <div className="space-y-2 text-blue-700 text-sm">
          {mcpToolCall.currentTask && (
            <p className="text-blue-600 text-sm">
              📋 {mcpToolCall.currentTask}
            </p>
          )}
          {mcpToolCall.estimatedSteps && (
            <p className="text-blue-500 text-xs">
              ⏱️ Estimated: {mcpToolCall.estimatedSteps} steps
            </p>
          )}
        </div>

        <ToolDetailsSection
          toolName={mcpToolCall.toolName}
          inputSchema={mcpToolCall.inputSchema}
          inputArguments={mcpToolCall.inputArguments}
        />
      </div>
    );
  }

  if (mcpToolCall.status === 'in-progress') {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <h3 className="font-semibold text-blue-800">AI Agent Working</h3>
        </div>
        <div className="space-y-2 text-blue-700 text-sm">
          {mcpToolCall.currentTask && (
            <p className="text-blue-600 text-sm">
              📋 {mcpToolCall.currentTask}
            </p>
          )}
          {mcpToolCall.progress && (
            <div className="space-y-2">
              <p className="text-blue-700 text-sm">
                {mcpToolCall.progress.currentStep &&
                mcpToolCall.progress.totalSteps
                  ? `Step ${mcpToolCall.progress.currentStep}/${mcpToolCall.progress.totalSteps}: `
                  : ''}
                {mcpToolCall.progress.step}
              </p>
              {mcpToolCall.progress.details && (
                <p className="text-blue-500 text-xs">
                  💡 {mcpToolCall.progress.details}
                </p>
              )}
              {mcpToolCall.progress.currentStep &&
                mcpToolCall.progress.totalSteps && (
                  <div className="mt-2 h-2 w-full rounded-full bg-blue-200">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${(mcpToolCall.progress.currentStep / mcpToolCall.progress.totalSteps) * 100}%`,
                      }}
                    />
                  </div>
                )}
            </div>
          )}
        </div>

        <ToolDetailsSection
          toolName={mcpToolCall.toolName}
          inputSchema={mcpToolCall.inputSchema}
          inputArguments={mcpToolCall.inputArguments}
        />
      </div>
    );
  }

  if (mcpToolCall.status === 'completed') {
    const success = mcpToolCall.result?.success ?? true;
    return (
      <div
        className={`rounded-lg border p-4 shadow-lg backdrop-blur ${
          success
            ? 'border-green-200 bg-green-50/90'
            : 'border-red-200 bg-red-50/90'
        }`}
      >
        <div className="mb-3 flex items-center gap-3">
          <div
            className={`flex size-5 items-center justify-center rounded-full ${
              success ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {success ? (
              <CheckCircleIcon className="size-3 text-white" />
            ) : (
              <XCircleIcon className="size-3 text-white" />
            )}
          </div>
          <h3
            className={`font-semibold ${
              success ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {success ? 'Task Completed Successfully' : 'Task Failed'}
          </h3>
        </div>
        <div
          className={`space-y-3 text-sm ${
            success ? 'text-green-700' : 'text-red-700'
          }`}
        >
          <p>
            {mcpToolCall.result?.message ||
              (success
                ? 'The agent has completed your request successfully.'
                : 'The agent failed to complete your request.')}
          </p>

          {mcpToolCall.result?.filesModified &&
            mcpToolCall.result.filesModified.length > 0 && (
              <div className="mt-2">
                <p
                  className={`mb-1 text-xs ${success ? 'text-green-600' : 'text-red-600'}`}
                >
                  📁 Files modified:
                </p>
                <div className="space-y-1">
                  {mcpToolCall.result.filesModified.map(
                    (file: string, index: number) => (
                      <span
                        key={file}
                        className={`mr-1 inline-block rounded px-2 py-1 text-xs ${
                          success
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {file}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}

          <button
            type="button"
            onClick={onReset}
            className={`flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 font-medium text-sm text-white transition-colors ${
              success
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (mcpToolCall.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-5 items-center justify-center rounded-full bg-red-500">
            <XCircleIcon className="size-3 text-white" />
          </div>
          <h3 className="font-semibold text-red-800">Error Occurred</h3>
        </div>
        <div className="space-y-3 text-red-700 text-sm">
          <p>
            {mcpToolCall.error?.error ||
              'An unexpected error occurred during task execution.'}
          </p>

          {mcpToolCall.error?.context && (
            <p className="text-red-500 text-xs">
              Context: {mcpToolCall.error.context}
            </p>
          )}

          {mcpToolCall.error?.recoverable !== undefined && (
            <p className="text-red-500 text-xs">
              {mcpToolCall.error.recoverable
                ? '🔄 Recoverable error'
                : '❌ Task aborted'}
            </p>
          )}

          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Subcomponent for disconnected state content
function DisconnectedStateContent({
  discover,
  discoveryError,
}: {
  discover: () => Promise<void>;
  discoveryError: string | null;
}) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <WifiOffIcon className="size-5 text-orange-600" />
        <h3 className="font-semibold text-orange-800">Not Connected</h3>
      </div>

      <div className="space-y-3 text-orange-700 text-sm">
        <p>The Stagewise toolbar isn't connected to any VS Code window.</p>

        {discoveryError && (
          <div className="rounded border border-red-200 bg-red-100 p-2 text-red-700">
            <strong>Error:</strong> {discoveryError}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">To connect:</p>
          <ol className="list-inside list-decimal space-y-1 pl-2 text-xs">
            <li>Open VS Code</li>
            <li>Install the Stagewise extension</li>
            <li>Make sure the extension is active</li>
            <li>Click refresh below</li>
          </ol>
        </div>

        <button
          type="button"
          onClick={discover}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-orange-700"
        >
          <RefreshCwIcon className="size-4" />
          Retry Connection
        </button>

        <div className="border-orange-200 border-t pt-2">
          <a
            href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 text-xs hover:text-orange-800 hover:underline"
          >
            Get VS Code Extension →
          </a>
        </div>
      </div>
    </div>
  );
}

// Subcomponent for connected state toolbar buttons
function ConnectedStateButtons({
  handleButtonClick,
  pluginBox,
  setPluginBox,
  openPanel,
  setOpenPanel,
  chatState,
}: {
  handleButtonClick: (handler: () => void) => (e: MouseEvent) => void;
  pluginBox: null | {
    component: VNode;
    pluginName: string;
  };
  setPluginBox: (value: typeof pluginBox) => void;
  openPanel: null | 'settings' | { pluginName: string; component: VNode };
  setOpenPanel: (value: typeof openPanel) => void;
  chatState: ReturnType<typeof useChatState>;
}) {
  const plugins = usePlugins();

  const pluginsWithActions = plugins.plugins.filter(
    (plugin) => plugin.onActionClick,
  );

  // Handler for settings button
  const handleOpenSettings = () =>
    setOpenPanel(openPanel === 'settings' ? null : 'settings');

  return (
    <>
      <SettingsButton
        onOpenPanel={handleOpenSettings}
        isActive={openPanel === 'settings'}
      />
      {pluginsWithActions.length > 0 && (
        <ToolbarSection>
          {pluginsWithActions.map((plugin) => (
            <ToolbarButton
              key={plugin.pluginName}
              onClick={handleButtonClick(() => {
                if (pluginBox?.pluginName !== plugin.pluginName) {
                  const component = plugin.onActionClick();

                  if (component) {
                    setPluginBox({
                      component: plugin.onActionClick(),
                      pluginName: plugin.pluginName,
                    });
                  }
                } else {
                  setPluginBox(null);
                }
              })}
              active={pluginBox?.pluginName === plugin.pluginName}
            >
              {plugin.iconSvg ? (
                <span className="size-4 stroke-zinc-950 text-zinc-950 *:size-full">
                  {plugin.iconSvg}
                </span>
              ) : (
                <PuzzleIcon className="size-4" />
              )}
            </ToolbarButton>
          ))}
        </ToolbarSection>
      )}
      <ToolbarSection>
        <ToolbarButton
          onClick={handleButtonClick(() =>
            chatState.isPromptCreationActive
              ? chatState.stopPromptCreation()
              : chatState.startPromptCreation(),
          )}
          active={chatState.isPromptCreationActive}
        >
          <MessageCircleIcon className="size-4 stroke-zinc-950" />
        </ToolbarButton>
      </ToolbarSection>
    </>
  );
}

export function ToolbarDraggableBox() {
  const provider = useContext(DraggableContext) as DraggableContextType | null;
  const borderLocation = provider?.borderLocation;
  const isReady =
    !!borderLocation &&
    borderLocation.right - borderLocation.left > 0 &&
    borderLocation.bottom - borderLocation.top > 0;

  const draggable = useDraggable({
    startThreshold: 10,
    initialSnapArea: 'bottomRight',
  });

  const { windows, isDiscovering, discoveryError, discover } = useVSCode();
  const isConnected = windows.length > 0;

  const [pluginBox, setPluginBox] = useState<null | {
    component: VNode;
    pluginName: string;
  }>(null);
  const [openPanel, setOpenPanel] = useState<
    null | 'settings' | { pluginName: string; component: VNode }
  >(null);

  const chatState = useChatState();

  const minimized = useAppState((state) => state.minimized);
  const minimize = useAppState((state) => state.minimize);
  const expand = useAppState((state) => state.expand);

  // Legacy completion flow state
  const completionState = useAppState((state) => state.completionState);
  const completionMessage = useAppState((state) => state.completionMessage);
  const resetCompletion = useAppState((state) => state.resetCompletion);

  // Enhanced MCP tool call state
  const mcpToolCall = useAppState((state) => state.mcpToolCall);
  const resetMcpTask = useAppState((state) => state.resetMcpTask);

  useEffect(() => {
    if (minimized) {
      setPluginBox(null);
      setOpenPanel(null);
    }
  }, [minimized]);

  // Create a wrapper function to handle button clicks
  const handleButtonClick = (handler: () => void) => (e: MouseEvent) => {
    // If we just finished dragging, prevent the click
    if (draggable.wasDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handler();
  };

  if (!isReady) return null; // Wait until borderLocation is valid

  // Determine which theme and content to show
  const isLoadingState = isDiscovering;
  const isDisconnectedState = !isConnected && !isDiscovering;
  const isConnectedState = isConnected;

  // Theme classes based on state
  const getThemeClasses = () => {
    if (isLoadingState) {
      return {
        border: 'border-blue-300',
        bg: 'bg-blue-100/80',
        divideBorder: 'divide-blue-200',
        buttonBg: 'from-blue-600 to-sky-600',
        buttonColor: 'text-blue-700',
      };
    }
    if (isDisconnectedState) {
      return {
        border: 'border-orange-300',
        bg: 'bg-orange-100/80',
        divideBorder: 'divide-orange-200',
        buttonBg: 'from-orange-600 to-red-600',
        buttonColor: 'text-orange-700',
      };
    }
    // Connected state (default)
    return {
      border: 'border-border/30',
      bg: 'bg-zinc-50/80',
      divideBorder: 'divide-border/20',
      buttonBg: 'from-sky-700 to-fuchsia-700',
      buttonColor: 'stroke-zinc-950',
    };
  };

  const theme = getThemeClasses();

  // Get the appropriate icon for the minimized state
  const getMinimizedIcon = () => {
    if (isLoadingState) {
      return <RefreshCwIcon className="size-4 animate-spin text-white" />;
    }
    if (isDisconnectedState) {
      return <WifiOffIcon className="size-4 text-white" />;
    }
    return <Logo className="size-4.5" color="white" />;
  };

  return (
    <div ref={draggable.draggableRef} className="absolute p-0.5">
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div
        className={cn(
          'absolute flex h-[calc(100vh-32px)] w-96 max-w-[40vw] items-stretch justify-end transition-all duration-300 ease-out',
          draggable.position.isTopHalf
            ? 'top-0 flex-col-reverse'
            : 'bottom-0 flex-col',
          draggable.position.isLeftHalf ? 'left-[100%]' : 'right-[100%]',
        )}
      >
        {/* This is the plugin box / info panel. Content varies by state. */}
        <div
          className={cn(
            'flex min-h-0 flex-1 origin-bottom-right flex-col items-stretch px-2 transition-all duration-300 ease-out',
            (pluginBox ||
              openPanel === 'settings' ||
              !isConnectedState ||
              (isConnectedState && completionState !== 'idle') ||
              (isConnectedState && mcpToolCall.status !== 'idle')) &&
              !minimized
              ? 'pointer-events-auto scale-100 opacity-100 blur-none'
              : 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
            draggable.position.isTopHalf ? 'justify-start' : 'justify-end',
            draggable.position.isTopHalf
              ? draggable.position.isLeftHalf
                ? 'origin-top-left'
                : 'origin-top-right'
              : draggable.position.isLeftHalf
                ? 'origin-bottom-left'
                : 'origin-bottom-right',
          )}
        >
          {/* Render content based on state */}
          {isLoadingState && <LoadingStateContent />}
          {isDisconnectedState && (
            <DisconnectedStateContent
              discover={discover}
              discoveryError={discoveryError}
            />
          )}
          {isConnectedState && mcpToolCall.status !== 'idle' && (
            <McpToolCallStatusContent
              mcpToolCall={mcpToolCall}
              onReset={resetMcpTask}
            />
          )}
          {isConnectedState &&
            completionState !== 'idle' &&
            mcpToolCall.status === 'idle' && (
              <CompletionStateContent
                completionState={completionState}
                completionMessage={completionMessage}
                onReset={resetCompletion}
              />
            )}
          {isConnectedState && openPanel === 'settings' && (
            <SettingsPanel onClose={() => setOpenPanel(null)} />
          )}
          {isConnectedState && pluginBox?.component}
        </div>

        {/* This is the chat area. Only visible when connected and prompt creation is active. */}
        {isConnectedState && (
          <div
            className={cn(
              'z-20 w-full px-2 transition-all duration-300 ease-out',
              chatState.isPromptCreationActive && !minimized
                ? 'pointer-events-auto scale-100 opacity-100 blur-none'
                : 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
              draggable.position.isTopHalf ? 'mb-2' : 'mt-2',
              draggable.position.isTopHalf
                ? draggable.position.isLeftHalf
                  ? 'origin-top-left'
                  : 'origin-top-right'
                : draggable.position.isLeftHalf
                  ? 'origin-bottom-left'
                  : 'origin-bottom-right',
            )}
          >
            <ToolbarChatArea />
          </div>
        )}
      </div>

      {/* Main toolbar handle */}
      <div
        ref={draggable.handleRef}
        className={cn(
          'pointer-events-auto z-50 rounded-full border px-0.5 shadow-md backdrop-blur transition-all duration-300 ease-out',
          theme.border,
          theme.bg,
          draggable.position.isTopHalf
            ? 'flex-col-reverse divide-y-reverse'
            : 'flex-col',
          minimized ? 'h-9.5 w-9.5' : 'h-[calc-size(auto,size)] h-auto w-auto',
        )}
      >
        {/* Minimized state button */}
        <Button
          onClick={() => expand()}
          className={cn(
            'absolute right-0 left-0 z-50 flex size-9 origin-center cursor-pointer items-center justify-center rounded-full bg-gradient-to-tr transition-all duration-300 ease-out',
            theme.buttonBg,
            minimized
              ? 'pointer-events-auto scale-100 opacity-100 blur-none'
              : 'pointer-events-none scale-25 opacity-0 blur-md',
            draggable.position.isTopHalf ? 'top-0' : 'bottom-0',
          )}
        >
          {getMinimizedIcon()}
        </Button>

        {/* Expanded toolbar content */}
        <div
          className={cn(
            'flex h-[calc-size(auto)] scale-100 items-center justify-center divide-y transition-all duration-300 ease-out',
            theme.divideBorder,
            draggable.position.isTopHalf
              ? 'origin-top flex-col-reverse divide-y-reverse'
              : 'origin-bottom flex-col',
            minimized && 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
          )}
        >
          {/* Show different buttons based on state */}
          {isConnectedState && (
            <ConnectedStateButtons
              handleButtonClick={handleButtonClick}
              pluginBox={pluginBox}
              setPluginBox={setPluginBox}
              openPanel={openPanel}
              setOpenPanel={setOpenPanel}
              chatState={chatState}
            />
          )}

          {(isLoadingState || isDisconnectedState) && (
            <ToolbarSection>
              <ToolbarButton
                onClick={isDisconnectedState ? () => discover() : undefined}
                className={cn(
                  theme.buttonColor,
                  isDisconnectedState && 'hover:bg-orange-200',
                )}
              >
                {isLoadingState && (
                  <RefreshCwIcon className="size-4 animate-spin" />
                )}
                {isDisconnectedState && <RefreshCwIcon className="size-4" />}
              </ToolbarButton>
            </ToolbarSection>
          )}

          {/* Minimize button - always present */}
          <ToolbarSection>
            <ToolbarButton
              onClick={handleButtonClick(() => minimize())}
              className={cn(
                'h-5',
                theme.buttonColor,
                draggable.position.isTopHalf
                  ? 'rounded-t-3xl rounded-b-lg'
                  : 'rounded-t-lg rounded-b-3xl',
              )}
            >
              {draggable.position.isTopHalf ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </ToolbarButton>
          </ToolbarSection>
        </div>
      </div>
    </div>
  );
}
