import type { RequestHandler } from 'express';

type LogLevel = 'LOG' | 'WARN' | 'ERROR' | 'INFO' | 'DEBUG';

type SerializedArgumentType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'undefined'
  | 'symbol'
  | 'function'
  | 'error'
  | 'other';

interface SerializedArgument {
  type: SerializedArgumentType;
  value: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  messageArgs: SerializedArgument[];
  stack?: string;
  context?: {
    url?: string;
    userAgent?: string;
    sessionId?: string;
    userId?: string;
  };
}

// Store logs in memory (you might want to persist these to a database in production)
const LOGS_AMOUNT = 20; // Maximum number of logs to keep
const logs: LogEntry[] = [];

export function addLogEntry(logEntry: LogEntry): {
  success: boolean;
  message: string;
} {
  // Basic validation
  if (
    !logEntry.id ||
    !logEntry.timestamp ||
    !logEntry.level ||
    !Array.isArray(logEntry.messageArgs)
  ) {
    throw new Error('Invalid log entry format');
  }

  // Add the log entry to our storage
  logs.push(logEntry);

  // Remove oldest logs if we exceed the limit
  if (logs.length > LOGS_AMOUNT) {
    logs.splice(0, logs.length - LOGS_AMOUNT);
  }

  return {
    success: true,
    message: 'Log entry received',
  };
}

export const handleConsoleLogs: RequestHandler = async (req, res) => {
  try {
    const logEntry = req.body as LogEntry;
    const result = addLogEntry(logEntry);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error processing console log:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

// Function to get console logs data directly (not as a RequestHandler)
export function getConsoleLogsData(amount?: number): LogEntry[] {
  // Get a copy of the logs array and reverse it to get newest first
  const reversedLogs = [...logs].reverse();

  // If amount is specified, return only that many logs
  return amount ? reversedLogs.slice(0, amount) : reversedLogs;
}
