import { capToolOutput } from './tool-output-capper';

export function rethrowCappedToolOutputError(error: unknown): never {
  if (error instanceof Error)
    throw new Error(
      capToolOutput(error.message, {
        maxBytes: 10 * 1024, // 10KB
      }).result,
    );

  if (!error) throw new Error('Unknown error');

  try {
    const message = String(error);
    throw new Error(capToolOutput(message, { maxBytes: 10 * 1024 }).result);
  } catch {
    try {
      const message = JSON.stringify(error);
      throw new Error(capToolOutput(message, { maxBytes: 10 * 1024 }).result);
    } catch {
      throw new Error('Unknown error');
    }
  }
}
