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

export class Logger {
  private readonly logger: winston.Logger;

  public constructor(verbose: boolean) {
    const logLevel: 'debug' | 'info' = verbose ? 'debug' : 'info';
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        colorizeFormat,
      ),
      transports: [new winston.transports.Console()],
    });
  }

  get log() {
    return this.logger.log.bind(this.logger);
  }
  get info() {
    return this.logger.info.bind(this.logger);
  }
  get warn() {
    return this.logger.warn.bind(this.logger);
  }
  get error() {
    return this.logger.error.bind(this.logger);
  }
  get debug() {
    return this.logger.debug.bind(this.logger);
  }

  set verboseMode(verbose: boolean) {
    this.logger.level = verbose ? 'debug' : 'info';
  }
}
