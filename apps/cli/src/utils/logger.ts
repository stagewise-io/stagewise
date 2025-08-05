import winston from 'winston';
import chalk from 'chalk';

// Custom format for colorized console output
const colorizeFormat = winston.format.printf(
  ({ level, message, timestamp }) => {
    const prefix = level === 'debug' ? `[DEBUG][${timestamp}] ` : '';

    switch (level) {
      case 'info':
        return chalk.cyan(`${prefix}${message}`);
      case 'warn':
        return chalk.yellow(`${prefix}${message}`);
      case 'error':
        return chalk.red(`${prefix}${message}`);
      case 'debug':
        return chalk.white(`${prefix}${message}`);
      default:
        return `${prefix}${message}`;
    }
  },
);

// Create logger instance
export const createLogger = (verbose: boolean): winston.Logger => {
  const logLevel = verbose ? 'debug' : 'info';

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      colorizeFormat,
    ),
    transports: [new winston.transports.Console()],
  });
};

// Default logger instance (will be replaced by configured one)
let logger = createLogger(false);

// Function to update logger configuration
export const configureLogger = (verbose: boolean): void => {
  logger = createLogger(verbose);
};

// Export logger methods
export const log = {
  info: (message: string) => logger.info(message),
  warn: (message: string) => logger.warn(message),
  error: (message: string) => logger.error(message),
  debug: (message: string) => logger.debug(message),
};
