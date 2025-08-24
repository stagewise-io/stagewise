import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('port-validator', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('validateAppPort', () => {
    it('should return isRunning: true when port has a running service', async () => {
      vi.mocked(axios.head).mockResolvedValue({ status: 200 });

      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(3000);

      expect(axios.head).toHaveBeenCalledWith('http://localhost:3000', {
        timeout: 2000,
        validateStatus: expect.any(Function),
      });
      expect(result).toEqual({ isRunning: true });
    });

    it('should return isRunning: true for any HTTP response (including errors)', async () => {
      vi.mocked(axios.head).mockResolvedValue({ status: 404 });

      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(3000);

      expect(result).toEqual({ isRunning: true });
    });

    it('should return isRunning: false when connection is refused', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      vi.mocked(axios.head).mockRejectedValue(error);

      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(3000);

      expect(result).toEqual({
        isRunning: false,
        error: 'No application detected on port 3000',
      });
    });

    it('should return isRunning: false when request times out', async () => {
      const error: any = new Error('Timeout');
      error.code = 'ECONNABORTED';
      vi.mocked(axios.head).mockRejectedValue(error);

      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(3000);

      expect(result).toEqual({
        isRunning: false,
        error: 'Request timed out - no application detected on port 3000',
      });
    });

    it('should return isRunning: false for network errors but log them', async () => {
      const error = new Error('Network error');
      vi.mocked(axios.head).mockRejectedValue(error);

      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(3000);

      expect(result).toEqual({
        isRunning: false,
        error: 'Could not connect to port 3000',
      });
    });

    it('should handle port 0 gracefully', async () => {
      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(0);

      expect(result).toEqual({
        isRunning: false,
        error: 'Invalid port number',
      });
      expect(axios.head).not.toHaveBeenCalled();
    });

    it('should handle invalid port numbers', async () => {
      const { validateAppPort } = await import(
        '../../../src/utils/port-validator'
      );
      const result = await validateAppPort(70000);

      expect(result).toEqual({
        isRunning: false,
        error: 'Invalid port number',
      });
      expect(axios.head).not.toHaveBeenCalled();
    });
  });
});