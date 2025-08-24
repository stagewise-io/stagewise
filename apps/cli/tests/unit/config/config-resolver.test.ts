import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as args from '../../../src/config/argparse';
import * as userInput from '../../../src/utils/user-input';
import * as portValidator from '../../../src/utils/port-validator';
import * as configFile from '../../../src/config/config-file';
import * as logger from '../../../src/utils/logger';

// Mock all dependencies
vi.mock('../../../src/config/argparse');
vi.mock('../../../src/utils/user-input');
vi.mock('../../../src/utils/port-validator');
vi.mock('../../../src/config/config-file');
vi.mock('../../../src/utils/logger');
vi.mock('../../../src/auth/token-manager', () => ({
  tokenManager: {
    getStoredToken: vi.fn(),
  },
}));
vi.mock('../../../src/auth/oauth', () => ({
  oauthManager: {
    ensureValidAccessToken: vi.fn(),
    initiateOAuthFlow: vi.fn(),
  },
}));
vi.mock('../../../src/utils/telemetry', () => ({
  telemetryManager: {
    hasConfigured: vi.fn().mockResolvedValue(true),
    promptForOptIn: vi.fn(),
  },
  analyticsEvents: {
    storedConfigJson: vi.fn(),
  },
}));

describe('ConfigResolver - Port Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    
    // Setup default mocks
    vi.mocked(args).workspace = '/test/dir';
    vi.mocked(args).silent = false;
    vi.mocked(args).verbose = false;
    vi.mocked(args).bridgeMode = false;
    vi.mocked(args).port = undefined;
    vi.mocked(args).appPort = undefined;
    vi.mocked(args).token = 'test-token';
    
    vi.mocked(configFile.loadConfigFile).mockResolvedValue(null);
    vi.mocked(configFile.configFileExists).mockResolvedValue(false);
    vi.mocked(configFile.saveConfigFile).mockResolvedValue();
    
    vi.mocked(logger.log).info = vi.fn();
    vi.mocked(logger.log).warn = vi.fn();
    vi.mocked(logger.log).error = vi.fn();
    vi.mocked(logger.log).debug = vi.fn();
    vi.mocked(logger.configureLogger).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Port validation flow', () => {
    it('should validate port and continue when app is running', async () => {
      vi.mocked(userInput.promptNumber).mockResolvedValueOnce(5714);
      vi.mocked(userInput.promptConfirm).mockResolvedValueOnce(false); // Don't save config
      vi.mocked(portValidator.validateAppPort).mockResolvedValueOnce({
        isRunning: true,
      });

      const { ConfigResolver } = await import('../../../src/config');
      const resolver = new ConfigResolver();
      const config = await resolver.resolveConfig();

      expect(config.appPort).toBe(5714);
      expect(portValidator.validateAppPort).toHaveBeenCalledWith(5714);
      expect(logger.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Application detected on port 5714')
      );
    });

    it('should retry when port has no running app', async () => {
      vi.mocked(userInput.promptNumber)
        .mockResolvedValueOnce(9999) // First try - wrong port
        .mockResolvedValueOnce(5714); // Second try - correct port
      
      vi.mocked(userInput.promptConfirm)
        .mockResolvedValueOnce(true)  // Yes, retry
        .mockResolvedValueOnce(false); // Don't save config
      
      vi.mocked(portValidator.validateAppPort)
        .mockResolvedValueOnce({
          isRunning: false,
          error: 'No application detected on port 9999',
        })
        .mockResolvedValueOnce({
          isRunning: true,
        });

      const { ConfigResolver } = await import('../../../src/config');
      const resolver = new ConfigResolver();
      const config = await resolver.resolveConfig();

      expect(config.appPort).toBe(5714);
      expect(portValidator.validateAppPort).toHaveBeenCalledTimes(2);
      expect(logger.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('No application detected on port 9999')
      );
    });

    it('should allow continuing without running app when user chooses', async () => {
      vi.mocked(userInput.promptNumber).mockResolvedValueOnce(9999);
      vi.mocked(userInput.promptConfirm)
        .mockResolvedValueOnce(false) // Don't retry
        .mockResolvedValueOnce(true)  // Continue anyway
        .mockResolvedValueOnce(false); // Don't save config
      
      vi.mocked(portValidator.validateAppPort).mockResolvedValueOnce({
        isRunning: false,
        error: 'No application detected on port 9999',
      });

      const { ConfigResolver } = await import('../../../src/config');
      const resolver = new ConfigResolver();
      const config = await resolver.resolveConfig();

      expect(config.appPort).toBe(9999);
      expect(logger.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Continuing with port 9999 (application not currently running)')
      );
    });

    it('should handle max retry attempts', async () => {
      vi.mocked(userInput.promptNumber)
        .mockResolvedValueOnce(8001)
        .mockResolvedValueOnce(8002)
        .mockResolvedValueOnce(8003);
      
      vi.mocked(userInput.promptConfirm)
        .mockResolvedValueOnce(true)  // Retry 1
        .mockResolvedValueOnce(true)  // Retry 2
        .mockResolvedValueOnce(true)  // Continue anyway after max attempts
        .mockResolvedValueOnce(false); // Don't save config
      
      vi.mocked(portValidator.validateAppPort)
        .mockResolvedValue({
          isRunning: false,
          error: 'No application detected',
        });

      const { ConfigResolver } = await import('../../../src/config');
      const resolver = new ConfigResolver();
      const config = await resolver.resolveConfig();

      expect(config.appPort).toBe(8003);
      expect(portValidator.validateAppPort).toHaveBeenCalledTimes(3);
      expect(userInput.promptNumber).toHaveBeenCalledTimes(3);
    });

    it('should work in bridge mode', async () => {
      vi.mocked(args).bridgeMode = true;
      vi.mocked(userInput.promptNumber).mockResolvedValueOnce(5714);
      vi.mocked(userInput.promptConfirm).mockResolvedValueOnce(false); // Don't save config
      vi.mocked(portValidator.validateAppPort).mockResolvedValueOnce({
        isRunning: true,
      });

      const { ConfigResolver } = await import('../../../src/config');
      const resolver = new ConfigResolver();
      const config = await resolver.resolveConfig();

      expect(config.appPort).toBe(5714);
      expect(config.bridgeMode).toBe(true);
      expect(portValidator.validateAppPort).toHaveBeenCalledWith(5714);
    });
  });
});