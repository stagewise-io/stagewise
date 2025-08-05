import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import winston from 'winston';
import { log, createLogger, configureLogger } from '../../../src/utils/logger';

// Mock winston
vi.mock('winston', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      format: {
        combine: vi.fn(),
        timestamp: vi.fn(),
        printf: vi.fn((fn: any) => fn),
      },
      transports: {
        Console: vi.fn(),
      },
    },
  };
});

describe('logger', () => {
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = winston.createLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export a logger instance', () => {
    expect(log).toBeDefined();
    expect(log.info).toBeDefined();
    expect(log.error).toBeDefined();
    expect(log.warn).toBeDefined();
    expect(log.debug).toBeDefined();
  });

  it('should log info messages', () => {
    log.info('Test info message');
    expect(mockLogger.info).toHaveBeenCalledWith('Test info message');
  });

  it('should log error messages', () => {
    log.error('Test error message');
    expect(mockLogger.error).toHaveBeenCalledWith('Test error message');
  });

  it('should log warning messages', () => {
    log.warn('Test warning message');
    expect(mockLogger.warn).toHaveBeenCalledWith('Test warning message');
  });

  it('should log debug messages', () => {
    log.debug('Test debug message');
    expect(mockLogger.debug).toHaveBeenCalledWith('Test debug message');
  });

  describe('createLogger', () => {
    it('should create logger with info level when verbose is false', () => {
      const _logger = createLogger(false);

      expect(winston.createLogger).toHaveBeenCalled();
      const lastCall = vi.mocked(winston.createLogger).mock.calls[
        vi.mocked(winston.createLogger).mock.calls.length - 1
      ];
      expect(lastCall?.[0]?.level).toBe('info');
    });

    it('should create logger with debug level when verbose is true', () => {
      const _logger = createLogger(true);

      expect(winston.createLogger).toHaveBeenCalled();
      const lastCall = vi.mocked(winston.createLogger).mock.calls[
        vi.mocked(winston.createLogger).mock.calls.length - 1
      ];
      expect(lastCall?.[0]?.level).toBe('debug');
    });
  });

  describe('configureLogger', () => {
    it('should update logger configuration', () => {
      configureLogger(true);

      expect(winston.createLogger).toHaveBeenCalled();
      const lastCall = vi.mocked(winston.createLogger).mock.calls[
        vi.mocked(winston.createLogger).mock.calls.length - 1
      ];
      expect(lastCall?.[0]?.level).toBe('debug');
    });
  });
});
