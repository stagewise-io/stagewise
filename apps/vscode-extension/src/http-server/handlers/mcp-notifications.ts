import type { RequestHandler } from 'express';

interface McpNotificationData {
  task?: string;
  estimatedSteps?: number;
  step?: string;
  currentStep?: number;
  totalSteps?: number;
  details?: string;
  success?: boolean;
  message?: string;
  filesModified?: string[];
  error?: string;
  context?: string;
  recoverable?: boolean;
  // Agent input schema properties
  toolName?: string;
  inputSchema?: Record<string, any>;
  inputArguments?: Record<string, any>;
}

// Global bridge reference - set during extension activation
let extensionBridge: any = null;

/**
 * Sets the extension bridge instance for broadcasting notifications
 */
export function setExtensionBridge(bridge: any): void {
  extensionBridge = bridge;
}

/**
 * Broadcasts notification to all connected toolbar instances via SRPC
 */
async function broadcastToToolbars(type: string, data: McpNotificationData) {
  console.log(`[MCP Notification] Broadcasting ${type}:`, data);

  if (!extensionBridge) {
    console.warn(
      '[MCP Notification] Extension bridge not available, skipping broadcast',
    );
    return;
  }

  try {
    switch (type) {
      case 'start':
        await extensionBridge.call.notifyMcpStart({
          task: data.task!,
          estimatedSteps: data.estimatedSteps,
          toolName: data.toolName,
          inputSchema: data.inputSchema,
          inputArguments: data.inputArguments,
        });
        break;

      case 'progress':
        await extensionBridge.call.notifyMcpProgress({
          step: data.step!,
          currentStep: data.currentStep,
          totalSteps: data.totalSteps,
          details: data.details,
        });
        break;

      case 'completion':
        await extensionBridge.call.notifyMcpCompletion({
          success: data.success!,
          message: data.message!,
          filesModified: data.filesModified,
        });
        break;

      case 'error':
        await extensionBridge.call.notifyMcpError({
          error: data.error!,
          context: data.context,
          recoverable: data.recoverable,
        });
        break;

      default:
        console.warn(`[MCP Notification] Unknown notification type: ${type}`);
    }

    console.log(
      `[MCP Notification] Successfully sent ${type} notification via SRPC`,
    );
  } catch (error) {
    console.error(
      `[MCP Notification] Failed to send ${type} notification via SRPC:`,
      error,
    );
  }
}

export const handleStartNotification: RequestHandler = async (req, res) => {
  try {
    const { task, estimatedSteps, toolName, inputSchema, inputArguments } =
      req.body;

    if (typeof task !== 'string') {
      res.status(400).json({ error: "'task' parameter must be a string" });
      return;
    }

    console.log(`[Stagewise] Task started: ${task}`);
    if (estimatedSteps) {
      console.log(`[Stagewise] Estimated steps: ${estimatedSteps}`);
    }
    if (toolName) {
      console.log(`[Stagewise] Tool: ${toolName}`);
    }
    if (inputArguments) {
      console.log(`[Stagewise] Input arguments:`, inputArguments);
    }

    await broadcastToToolbars('start', {
      task,
      estimatedSteps,
      toolName,
      inputSchema,
      inputArguments,
    });

    res.json({
      status: 'success',
      message: `Task started: ${task}${estimatedSteps ? ` (${estimatedSteps} estimated steps)` : ''}`,
    });
  } catch (error) {
    console.error('Error handling start notification:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const handleProgressNotification: RequestHandler = async (req, res) => {
  try {
    const { step, currentStep, totalSteps, details } = req.body;

    if (typeof step !== 'string') {
      res.status(400).json({ error: "'step' parameter must be a string" });
      return;
    }

    console.log(`[Stagewise] Progress: ${step}`);
    if (currentStep && totalSteps) {
      console.log(`[Stagewise] Step ${currentStep}/${totalSteps}`);
    }

    await broadcastToToolbars('progress', {
      step,
      currentStep,
      totalSteps,
      details,
    });

    res.json({
      status: 'success',
      message: `Progress: ${step}${currentStep && totalSteps ? ` (${currentStep}/${totalSteps})` : ''}`,
    });
  } catch (error) {
    console.error('Error handling progress notification:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const handleCompletionNotification: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { success, message, filesModified } = req.body;

    if (typeof success !== 'boolean') {
      res.status(400).json({ error: "'success' parameter must be a boolean" });
      return;
    }

    if (typeof message !== 'string') {
      res.status(400).json({ error: "'message' parameter must be a string" });
      return;
    }

    console.log(
      `[Stagewise] Completion notification: ${success ? 'SUCCESS' : 'FAILURE'} - ${message}`,
    );

    await broadcastToToolbars('completion', {
      success,
      message,
      filesModified,
    });

    res.json({
      status: 'success',
      message: `Task completion recorded: ${success ? 'SUCCESS' : 'FAILURE'}`,
    });
  } catch (error) {
    console.error('Error handling completion notification:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const handleErrorNotification: RequestHandler = async (req, res) => {
  try {
    const { error, context, recoverable } = req.body;

    if (typeof error !== 'string') {
      res.status(400).json({ error: "'error' parameter must be a string" });
      return;
    }

    console.error(`[Stagewise] Error: ${error}`);
    if (context) {
      console.error(`[Stagewise] Context: ${context}`);
    }

    await broadcastToToolbars('error', { error, context, recoverable });

    res.json({
      status: 'success',
      message: `Error recorded: ${error}`,
    });
  } catch (error) {
    console.error('Error handling error notification:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
