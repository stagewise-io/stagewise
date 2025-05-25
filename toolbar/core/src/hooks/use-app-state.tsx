// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar app state hook
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

// This hook manages the state of the companion app. It provides information about all high level stuff that affects what components are rendered etc.

// This hook provides information to all components about whether certain parts of the companion layout should be rendered or not.
// Components can use this information to hide themselves or show additional information.

import { createRef, type RefObject } from 'preact';
import { create, type StateCreator } from 'zustand';
import SuperJSON from 'superjson';
import { persist, type PersistStorage } from 'zustand/middleware';

export type CompletionState = 'idle' | 'loading' | 'success' | 'error';

// Enhanced MCP tool call state
export type McpToolCallStatus =
  | 'idle'
  | 'starting'
  | 'in-progress'
  | 'completed'
  | 'error';

export interface McpToolCallState {
  status: McpToolCallStatus;
  currentTask?: string;
  estimatedSteps?: number;
  // Agent input schema properties
  toolName?: string;
  inputSchema?: Record<string, any>;
  inputArguments?: Record<string, any>;
  progress?: {
    step: string;
    currentStep?: number;
    totalSteps?: number;
    details?: string;
  };
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
  timeoutId?: number;
}

export interface AppState {
  requestMainAppBlock: () => number;
  requestMainAppUnblock: () => number;
  discardMainAppBlock: (handle: number) => void;
  discardMainAppUnblock: (handle: number) => void;

  isMainAppBlocked: boolean;

  toolbarBoxRef: RefObject<HTMLElement | null>; // used to place popovers in case the reference is not available
  setToolbarBoxRef: (ref: RefObject<HTMLElement | null>) => void;
  unsetToolbarBoxRef: () => void;

  minimized: boolean;
  minimize: () => void;
  expand: () => void;

  promotedOnStartup: boolean; // This will be false initially, but will be set to true for the next re-hydration fo the store. If allows components to read and create an additional promoting animation.
  promotionFinished: () => void;

  // Legacy completion flow state (for backward compatibility)
  completionState: CompletionState;
  completionMessage: string | null;
  completionTimeoutId: number | null;

  // Legacy completion flow actions
  startCompletion: () => void;
  completeSuccess: (message: string) => void;
  completeError: (message: string) => void;
  resetCompletion: () => void;

  // Enhanced MCP tool call state
  mcpToolCall: McpToolCallState;

  // Enhanced MCP tool call actions
  startMcpTask: (
    task: string,
    estimatedSteps?: number,
    toolName?: string,
    inputSchema?: Record<string, any>,
    inputArguments?: Record<string, any>,
  ) => void;
  updateMcpProgress: (
    step: string,
    currentStep?: number,
    totalSteps?: number,
    details?: string,
  ) => void;
  completeMcpTask: (
    success: boolean,
    message: string,
    filesModified?: string[],
  ) => void;
  errorMcpTask: (
    error: string,
    context?: string,
    recoverable?: boolean,
  ) => void;
  resetMcpTask: () => void;
}

export interface InternalAppState extends AppState {
  appBlockRequestList: number[];
  appUnblockRequestList: number[];
  lastBlockRequestNumber: number;
  lastUnblockRequestNumber: number;
}

const createAppStore: StateCreator<AppState> = (s) => {
  const set = s as (
    partial:
      | InternalAppState
      | Partial<InternalAppState>
      | ((
          state: InternalAppState,
        ) => InternalAppState | Partial<InternalAppState>),
    replace?: boolean | undefined,
  ) => void;
  return {
    appBlockRequestList: [],
    appUnblockRequestList: [],
    lastBlockRequestNumber: 0,
    lastUnblockRequestNumber: 0,

    isMainAppBlocked: false,

    requestMainAppBlock: () => {
      let newHandleValue = 0;
      set((state) => {
        newHandleValue = state.lastBlockRequestNumber + 1;
        return {
          appBlockRequestList: [...state.appBlockRequestList, newHandleValue],
          lastBlockRequestNumber: newHandleValue,
          isMainAppBlocked: state.appUnblockRequestList.length === 0, // Unblock requests override block requests
        };
      });
      return newHandleValue;
    },
    requestMainAppUnblock: () => {
      let newHandleValue = 0;
      set((state) => {
        newHandleValue = state.lastUnblockRequestNumber + 1;
        return {
          appUnblockRequestList: [
            ...state.appUnblockRequestList,
            newHandleValue,
          ],
          lastUnblockRequestNumber: newHandleValue,
          isMainAppBlocked: false,
        };
      });
      return newHandleValue;
    },

    discardMainAppBlock: (handle: number) => {
      set((state) => {
        const newBlockRequestList = state.appBlockRequestList.filter(
          (h) => h !== handle,
        );
        return {
          appBlockRequestList: newBlockRequestList,
          isMainAppBlocked:
            newBlockRequestList.length > 0 &&
            state.appUnblockRequestList.length === 0,
        };
      });
    },

    discardMainAppUnblock: (handle: number) => {
      set((state) => {
        const newUnblockRequestList = state.appUnblockRequestList.filter(
          (h) => h !== handle,
        );
        return {
          appUnblockRequestList: newUnblockRequestList,
          isMainAppBlocked:
            state.appBlockRequestList.length > 0 &&
            newUnblockRequestList.length === 0,
        };
      });
    },

    toolbarBoxRef: createRef(),
    setToolbarBoxRef: (ref) => set(() => ({ toolbarBoxRef: ref })),
    unsetToolbarBoxRef: () => set(() => ({ toolbarBoxRef: createRef() })),

    minimized: false,
    minimize: () => set(() => ({ minimized: true })),
    expand: () => set(() => ({ minimized: false })),

    promotedOnStartup: false,
    promotionFinished: () => set(() => ({ promotedOnStartup: true })),

    // Legacy completion flow state
    completionState: 'idle',
    completionMessage: null,
    completionTimeoutId: null,

    // Legacy completion flow actions
    startCompletion: () => {
      set((state) => {
        // Clear any existing timeout
        if (state.completionTimeoutId) {
          clearTimeout(state.completionTimeoutId);
        }

        // Set 30-second timeout for error state
        const timeoutId = window.setTimeout(() => {
          set({
            completionState: 'error',
            completionMessage: 'Agent completion timed out after 30 seconds',
            completionTimeoutId: null,
          });
        }, 30000);

        return {
          completionState: 'loading',
          completionMessage: null,
          completionTimeoutId: timeoutId,
        };
      });
    },

    completeSuccess: (message: string) => {
      set((state) => {
        // Clear timeout
        if (state.completionTimeoutId) {
          clearTimeout(state.completionTimeoutId);
        }

        return {
          completionState: 'success',
          completionMessage: message,
          completionTimeoutId: null,
        };
      });
    },

    completeError: (message: string) => {
      set((state) => {
        // Clear timeout
        if (state.completionTimeoutId) {
          clearTimeout(state.completionTimeoutId);
        }

        return {
          completionState: 'error',
          completionMessage: message,
          completionTimeoutId: null,
        };
      });
    },

    resetCompletion: () => {
      set((state) => {
        // Clear timeout
        if (state.completionTimeoutId) {
          clearTimeout(state.completionTimeoutId);
        }

        return {
          completionState: 'idle',
          completionMessage: null,
          completionTimeoutId: null,
        };
      });
    },

    // Enhanced MCP tool call state
    mcpToolCall: {
      status: 'idle',
    },

    // Enhanced MCP tool call actions
    startMcpTask: (
      task: string,
      estimatedSteps?: number,
      toolName?: string,
      inputSchema?: Record<string, any>,
      inputArguments?: Record<string, any>,
    ) => {
      set((state) => {
        // Clear any existing timeout
        if (state.mcpToolCall.timeoutId) {
          clearTimeout(state.mcpToolCall.timeoutId);
        }

        // Set 60-second timeout for error state (longer than legacy)
        const timeoutId = window.setTimeout(() => {
          set((state) => ({
            mcpToolCall: {
              ...state.mcpToolCall,
              status: 'error',
              error: {
                error: 'Agent task timed out after 60 seconds',
                recoverable: false,
              },
              timeoutId: undefined,
            },
          }));
        }, 60000);

        return {
          mcpToolCall: {
            status: 'starting',
            currentTask: task,
            estimatedSteps,
            toolName,
            inputSchema,
            inputArguments,
            timeoutId,
            progress: undefined,
            result: undefined,
            error: undefined,
          },
        };
      });
    },

    updateMcpProgress: (
      step: string,
      currentStep?: number,
      totalSteps?: number,
      details?: string,
    ) => {
      set((state) => ({
        mcpToolCall: {
          ...state.mcpToolCall,
          status: 'in-progress',
          progress: {
            step,
            currentStep,
            totalSteps,
            details,
          },
        },
      }));
    },

    completeMcpTask: (
      success: boolean,
      message: string,
      filesModified?: string[],
    ) => {
      set((state) => {
        // Clear timeout
        if (state.mcpToolCall.timeoutId) {
          clearTimeout(state.mcpToolCall.timeoutId);
        }

        const newState = {
          mcpToolCall: {
            ...state.mcpToolCall,
            status: 'completed' as McpToolCallStatus,
            result: {
              success,
              message,
              filesModified,
            },
            timeoutId: undefined,
          },
        };

        // Auto-reset after 5 seconds on success
        if (success) {
          setTimeout(() => {
            set((state) => ({
              mcpToolCall: {
                status: 'idle',
              },
            }));
          }, 5000);
        }

        return newState;
      });
    },

    errorMcpTask: (error: string, context?: string, recoverable?: boolean) => {
      set((state) => {
        // Clear timeout
        if (state.mcpToolCall.timeoutId) {
          clearTimeout(state.mcpToolCall.timeoutId);
        }

        return {
          mcpToolCall: {
            ...state.mcpToolCall,
            status: 'error',
            error: {
              error,
              context,
              recoverable,
            },
            timeoutId: undefined,
          },
        };
      });
    },

    resetMcpTask: () => {
      set((state) => {
        // Clear timeout
        if (state.mcpToolCall.timeoutId) {
          clearTimeout(state.mcpToolCall.timeoutId);
        }

        return {
          mcpToolCall: {
            status: 'idle',
          },
        };
      });
    },
  };
};

function createSuperJSONStorage<T>(storage: Storage): PersistStorage<T> {
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      return SuperJSON.parse(str);
    },
    setItem: (name, value) => {
      storage.setItem(name, SuperJSON.stringify(value));
    },
    removeItem: (name) => storage.removeItem(name),
  };
}

export const useAppState = create(
  persist(createAppStore, {
    name: 'stgws:companion',
    storage: createSuperJSONStorage(sessionStorage),
    partialize: (state) => {
      return {
        minimized: state.minimized,
      };
    },
  }),
);
