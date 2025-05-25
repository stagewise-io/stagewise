// SPDX-License-Identifier: AGPL-3.0-only
// Stagewise Core MCP Server
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Stagewise Core MCP Server
 * Provides essential workflow tools for the Stagewise development environment
 */
class StagewiseCoreServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'stagewise-core',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'stagewise_notify_start',
            description:
              'Notify Stagewise toolbar that work on a task has started',
            inputSchema: {
              type: 'object',
              properties: {
                task: {
                  type: 'string',
                  description: 'Brief description of the task being started',
                },
                estimatedSteps: {
                  type: 'number',
                  description:
                    'Optional estimated number of steps/phases for this task',
                },
              },
              required: ['task'],
            },
          },
          {
            name: 'stagewise_notify_progress',
            description:
              'Notify Stagewise toolbar of progress during task execution',
            inputSchema: {
              type: 'object',
              properties: {
                step: {
                  type: 'string',
                  description:
                    'Description of the current step being worked on',
                },
                currentStep: {
                  type: 'number',
                  description: 'Current step number (1-based)',
                },
                totalSteps: {
                  type: 'number',
                  description: 'Total number of steps (if known)',
                },
                details: {
                  type: 'string',
                  description:
                    'Optional additional details about current progress',
                },
              },
              required: ['step'],
            },
          },
          {
            name: 'stagewise_notify_completion',
            description:
              'Notify Stagewise toolbar that a task has been completed',
            inputSchema: {
              type: 'object',
              properties: {
                success: {
                  type: 'boolean',
                  description: 'Whether the task was completed successfully',
                },
                message: {
                  type: 'string',
                  description: 'Brief description of what was accomplished',
                },
                filesModified: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional list of files that were modified',
                },
              },
              required: ['success', 'message'],
            },
          },
          {
            name: 'stagewise_notify_error',
            description:
              'Notify Stagewise toolbar that an error occurred during task execution',
            inputSchema: {
              type: 'object',
              properties: {
                error: {
                  type: 'string',
                  description: 'Description of the error that occurred',
                },
                context: {
                  type: 'string',
                  description:
                    'Optional context about what was being attempted when the error occurred',
                },
                recoverable: {
                  type: 'boolean',
                  description:
                    'Whether this is a recoverable error or task should be aborted',
                },
              },
              required: ['error'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'stagewise_notify_start':
          return this.handleStartNotification(args);

        case 'stagewise_notify_progress':
          return this.handleProgressNotification(args);

        case 'stagewise_notify_completion':
          return this.handleCompletionNotification(args);

        case 'stagewise_notify_error':
          return this.handleErrorNotification(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleStartNotification(args: any) {
    const { task, estimatedSteps } = args;

    if (typeof task !== 'string') {
      throw new Error("'task' parameter must be a string");
    }

    console.error(`[Stagewise] Task started: ${task}`);
    if (estimatedSteps) {
      console.error(`[Stagewise] Estimated steps: ${estimatedSteps}`);
    }

    await this.notifyExtension('/start', { task, estimatedSteps });

    return {
      content: [
        {
          type: 'text',
          text: `Task started: ${task}${estimatedSteps ? ` (${estimatedSteps} estimated steps)` : ''}`,
        },
      ],
    };
  }

  private async handleProgressNotification(args: any) {
    const { step, currentStep, totalSteps, details } = args;

    if (typeof step !== 'string') {
      throw new Error("'step' parameter must be a string");
    }

    console.error(`[Stagewise] Progress: ${step}`);
    if (currentStep && totalSteps) {
      console.error(`[Stagewise] Step ${currentStep}/${totalSteps}`);
    }

    await this.notifyExtension('/progress', {
      step,
      currentStep,
      totalSteps,
      details,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Progress: ${step}${currentStep && totalSteps ? ` (${currentStep}/${totalSteps})` : ''}`,
        },
      ],
    };
  }

  private async handleCompletionNotification(args: any) {
    const { success, message, filesModified } = args;

    if (typeof success !== 'boolean') {
      throw new Error("'success' parameter must be a boolean");
    }

    if (typeof message !== 'string') {
      throw new Error("'message' parameter must be a string");
    }

    console.error(
      `[Stagewise] Completion notification: ${success ? 'SUCCESS' : 'FAILURE'} - ${message}`,
    );

    await this.notifyExtension('/completion', {
      success,
      message,
      filesModified,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Task completion recorded: ${success ? 'SUCCESS' : 'FAILURE'}\nMessage: ${message}`,
        },
      ],
    };
  }

  private async handleErrorNotification(args: any) {
    const { error, context, recoverable } = args;

    if (typeof error !== 'string') {
      throw new Error("'error' parameter must be a string");
    }

    console.error(`[Stagewise] Error: ${error}`);
    if (context) {
      console.error(`[Stagewise] Context: ${context}`);
    }

    await this.notifyExtension('/error', { error, context, recoverable });

    return {
      content: [
        {
          type: 'text',
          text: `Error recorded: ${error}${context ? `\nContext: ${context}` : ''}`,
        },
      ],
    };
  }

  /**
   * Common method to notify the extension via HTTP
   */
  private async notifyExtension(endpoint: string, data: any): Promise<void> {
    try {
      // Try to find the extension by checking common ports (5746-5756)
      const basePorts = [
        5746, 5747, 5748, 5749, 5750, 5751, 5752, 5753, 5754, 5755, 5756,
      ];
      let notified = false;

      for (const port of basePorts) {
        try {
          // First check if this is a Stagewise extension port
          const pingResponse = await fetch(
            `http://localhost:${port}/ping/stagewise`,
          );
          if (pingResponse.ok && (await pingResponse.text()) === 'stagewise') {
            // This is a Stagewise extension, try to send notification
            const response = await fetch(
              `http://localhost:${port}${endpoint}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
              },
            );

            if (response.ok) {
              console.error(
                `[Stagewise] Successfully notified extension on port ${port}${endpoint}`,
              );
              notified = true;
              break;
            }
          }
        } catch (error) {
          // Continue to next port
          continue;
        }
      }

      if (!notified) {
        console.error('[Stagewise] Could not find extension to notify');
      }
    } catch (error) {
      console.error('[Stagewise] Failed to notify extension:', error);
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[Stagewise MCP Server] Error:', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Stagewise MCP Server] Server running on stdio');
  }
}

// Run the server if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new StagewiseCoreServer();
  server.run().catch((error) => {
    console.error('[Stagewise MCP Server] Failed to start:', error);
    process.exit(1);
  });
}

export { StagewiseCoreServer };
