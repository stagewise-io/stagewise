import { describe, it, expect, vi } from 'vitest';
import {
  createProcedureProxy,
  extractProceduresFromTree,
  resolveProcedurePath
} from '../../src/shared/procedure-proxy.js';

describe('Procedure Proxy', () => {
  describe('createProcedureProxy', () => {
    it('should create proxy for flat procedures', async () => {
      const mockCall = vi.fn().mockResolvedValue('result');
      
      const proxy = createProcedureProxy(mockCall);
      const result = await proxy.testProcedure('arg1', 'arg2');
      
      expect(mockCall).toHaveBeenCalledWith(['testProcedure'], ['arg1', 'arg2'], undefined);
      expect(result).toBe('result');
    });

    it('should create proxy for nested procedures', async () => {
      const mockCall = vi.fn().mockResolvedValue('nested-result');
      
      const proxy = createProcedureProxy(mockCall);
      const result = await proxy.api.v1.users.create({ name: 'Alice' });
      
      expect(mockCall).toHaveBeenCalledWith(
        ['api', 'v1', 'users', 'create'],
        [{ name: 'Alice' }],
        undefined
      );
      expect(result).toBe('nested-result');
    });

    it('should pass options to call function', async () => {
      const mockCall = vi.fn().mockResolvedValue('result');
      const options = { timeout: 5000, clientId: 'client-123' };
      
      const proxy = createProcedureProxy(mockCall, options);
      await proxy.test();
      
      expect(mockCall).toHaveBeenCalledWith(['test'], [], options);
    });

    it('should handle multiple levels of nesting', async () => {
      const mockCall = vi.fn().mockResolvedValue('deep-result');
      
      const proxy = createProcedureProxy(mockCall);
      const result = await proxy.level1.level2.level3.level4.level5.procedure();
      
      expect(mockCall).toHaveBeenCalledWith(
        ['level1', 'level2', 'level3', 'level4', 'level5', 'procedure'],
        [],
        undefined
      );
      expect(result).toBe('deep-result');
    });

    it('should preserve this context in proxy calls', async () => {
      const mockCall = vi.fn().mockResolvedValue('result');
      
      const proxy = createProcedureProxy(mockCall);
      const procedure = proxy.test;
      const result = await procedure('arg');
      
      expect(mockCall).toHaveBeenCalledWith(['test'], ['arg'], undefined);
      expect(result).toBe('result');
    });

    it('should handle property access without calling', () => {
      const mockCall = vi.fn();
      
      const proxy = createProcedureProxy(mockCall);
      const subProxy = proxy.api.v1;
      
      expect(mockCall).not.toHaveBeenCalled();
      expect(typeof subProxy).toBe('function'); // Proxy wraps a function
    });

    it('should support toString and valueOf without calling RPC', () => {
      const mockCall = vi.fn();
      
      const proxy = createProcedureProxy(mockCall);
      
      expect(String(proxy.test)).toBe('[Proxy: test]');
      expect(proxy.test.valueOf()).toBe('[Proxy: test]');
      expect(mockCall).not.toHaveBeenCalled();
    });
  });

  describe('extractProceduresFromTree', () => {
    it('should extract flat procedures', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      const tree = {
        proc1: handler1,
        proc2: handler2
      };
      
      const extracted = extractProceduresFromTree(tree);
      
      expect(extracted.get('proc1')).toBe(handler1);
      expect(extracted.get('proc2')).toBe(handler2);
    });

    it('should extract nested procedures', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      
      const tree = {
        api: {
          v1: {
            users: handler1,
            posts: handler2
          },
          v2: {
            users: handler3
          }
        }
      };
      
      const extracted = extractProceduresFromTree(tree);
      
      expect(extracted.get('api.v1.users')).toBe(handler1);
      expect(extracted.get('api.v1.posts')).toBe(handler2);
      expect(extracted.get('api.v2.users')).toBe(handler3);
    });

    it('should handle mixed nesting levels', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      
      const tree = {
        simple: handler1,
        nested: {
          level1: {
            level2: handler2
          }
        },
        another: handler3
      };
      
      const extracted = extractProceduresFromTree(tree);
      
      expect(extracted.get('simple')).toBe(handler1);
      expect(extracted.get('nested.level1.level2')).toBe(handler2);
      expect(extracted.get('another')).toBe(handler3);
    });

    it('should ignore non-function values', () => {
      const handler = vi.fn();
      
      const tree = {
        proc: handler,
        ignored: 'string',
        alsoIgnored: 123,
        nested: {
          validProc: handler,
          invalid: null
        }
      };
      
      const extracted = extractProceduresFromTree(tree as any);
      
      expect(extracted.size).toBe(2);
      expect(extracted.get('proc')).toBe(handler);
      expect(extracted.get('nested.validProc')).toBe(handler);
    });

    it('should handle empty tree', () => {
      const extracted = extractProceduresFromTree({});
      expect(extracted.size).toBe(0);
    });

    it('should handle undefined input', () => {
      const extracted = extractProceduresFromTree(undefined as any);
      expect(extracted.size).toBe(0);
    });
  });

  describe('resolveProcedurePath', () => {
    it('should resolve simple path', () => {
      const handler = vi.fn();
      const tree = { test: handler };
      
      const resolved = resolveProcedurePath(tree, ['test']);
      expect(resolved).toBe(handler);
    });

    it('should resolve nested path', () => {
      const handler = vi.fn();
      const tree = {
        api: {
          v1: {
            users: {
              create: handler
            }
          }
        }
      };
      
      const resolved = resolveProcedurePath(tree, ['api', 'v1', 'users', 'create']);
      expect(resolved).toBe(handler);
    });

    it('should return undefined for non-existent path', () => {
      const tree = {
        api: {
          v1: {
            users: vi.fn()
          }
        }
      };
      
      const resolved = resolveProcedurePath(tree, ['api', 'v2', 'users']);
      expect(resolved).toBeUndefined();
    });

    it('should return undefined for path to non-function', () => {
      const tree = {
        api: {
          v1: 'not a function'
        }
      };
      
      const resolved = resolveProcedurePath(tree as any, ['api', 'v1']);
      expect(resolved).toBeUndefined();
    });

    it('should handle empty path', () => {
      const tree = { test: vi.fn() };
      const resolved = resolveProcedurePath(tree, []);
      expect(resolved).toBeUndefined();
    });
  });
});