import axios from 'axios';
import { log } from './logger';

export interface PortValidationResult {
  isRunning: boolean;
  error?: string;
}

export async function validateAppPort(
  port: number,
): Promise<PortValidationResult> {
  if (port <= 0 || port > 65535) {
    return {
      isRunning: false,
      error: 'Invalid port number',
    };
  }

  try {
    await axios.head(`http://localhost:${port}`, {
      timeout: 2000,
      validateStatus: () => true,
    });

    log.debug(`Application detected on port ${port}`);
    return { isRunning: true };
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      log.debug(`No application running on port ${port}`);
      return {
        isRunning: false,
        error: `No application detected on port ${port}`,
      };
    }

    if (error.code === 'ECONNABORTED') {
      log.debug(`Request timed out for port ${port}`);
      return {
        isRunning: false,
        error: `Request timed out - no application detected on port ${port}`,
      };
    }

    log.debug(`Error checking port ${port}: ${error.message}`);
    return {
      isRunning: false,
      error: `Could not connect to port ${port}`,
    };
  }
}
