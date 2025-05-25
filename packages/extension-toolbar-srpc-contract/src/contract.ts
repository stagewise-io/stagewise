// SPDX-License-Identifier: AGPL-3.0-only
// SRPC contract implementation for VS Code extension and toolbar communication
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

import { createBridgeContract } from '@stagewise/srpc';
import { z } from 'zod';

// The toolbar needs to implement a discovery-mechanism to check if the extension is running and find the correct port
// The extension also needs to implement a discovery-mechanism to find the correct toolbar.
export const DEFAULT_PORT = 5746; // This is the default port for the extension's RPC and MCP servers; if occupied, the extension will take the next available port (5747, 5748, etc., up to 5756
export const PING_ENDPOINT = '/ping/stagewise'; // Will be used by the toolbar to check if the extension is running and find the correct port
export const PING_RESPONSE = 'stagewise'; // The response to the ping request

/**
 * MCP Server configuration schema that follows official MCP client configuration format
 * Transport type is inferred from the presence of command (stdio) or url (sse/http)
 */
const McpServerSchema = z
  .object({
    // stdio transport
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    envFile: z.string().optional(),
    // sse/http transport
    url: z.string().optional(),
    headers: z.record(z.string()).optional(),
    // Additional server-specific settings
  })
  .passthrough(); // Allow additional properties

const NamedMcpServerSchema = z.object({
  name: z.string(),
  config: McpServerSchema,
});

export const contract = createBridgeContract({
  server: {
    registerMCP: {
      request: z.object({
        servers: z.array(NamedMcpServerSchema),
        source: z
          .string()
          .optional()
          .describe(
            "Source of the registration (e.g., 'toolbar-init', 'plugin-load')",
          ),
      }),
      response: z.object({
        result: z.object({
          success: z.boolean(),
          error: z.string().optional(),
          output: z.string().optional(),
        }),
      }),
      update: z.object({
        updateText: z.string(),
      }),
    },
    getSessionInfo: {
      request: z.object({}),
      response: z.object({
        sessionId: z.string().optional(),
        appName: z
          .string()
          .describe('The name of the application, e.g. "VS Code" or "Cursor"'),
        displayName: z
          .string()
          .describe('Human-readable window identifier for UI display'),
        port: z
          .number()
          .describe('Port number this VS Code instance is running on'),
      }),
      update: z.object({}),
    },
    triggerAgentPrompt: {
      request: z.object({
        sessionId: z.string().optional(),
        prompt: z.string(),
        model: z
          .string()
          .optional()
          .describe('The model to use for the agent prompt'),
        files: z
          .array(z.string())
          .optional()
          .describe('Link project files to the agent prompt'),
        mode: z
          .enum(['agent', 'ask', 'manual'])
          .optional()
          .describe('The mode to use for the agent prompt'),
        images: z
          .array(z.string())
          .optional()
          .describe('Upload files like images, videos, etc.'),
      }),
      response: z.object({
        sessionId: z.string().optional(),
        result: z.object({
          success: z.boolean(),
          error: z.string().optional(),
          output: z.string().optional(),
        }),
      }),
      update: z.object({
        sessionId: z.string().optional(),
        updateText: z.string(),
      }),
    },
  },
  client: {
    notifyCompletionSuccess: {
      request: z.object({
        message: z.string(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
    notifyCompletionError: {
      request: z.object({
        message: z.string(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
    // Enhanced MCP tool call notifications
    notifyMcpStart: {
      request: z.object({
        task: z.string(),
        estimatedSteps: z.number().optional(),
        toolName: z.string().optional(),
        inputSchema: z.record(z.any()).optional(),
        inputArguments: z.record(z.any()).optional(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
    notifyMcpProgress: {
      request: z.object({
        step: z.string(),
        currentStep: z.number().optional(),
        totalSteps: z.number().optional(),
        details: z.string().optional(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
    notifyMcpCompletion: {
      request: z.object({
        success: z.boolean(),
        message: z.string(),
        filesModified: z.array(z.string()).optional(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
    notifyMcpError: {
      request: z.object({
        error: z.string(),
        context: z.string().optional(),
        recoverable: z.boolean().optional(),
      }),
      response: z.object({
        success: z.boolean(),
      }),
      update: z.object({}),
    },
  },
});

export type PromptRequest = z.infer<
  typeof contract.server.triggerAgentPrompt.request
>;

export type VSCodeContext = z.infer<
  typeof contract.server.getSessionInfo.response
>;
