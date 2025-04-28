import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import http from 'node:http';
import {
  type CreateBridgeContract,
  type RpcMethodContract,
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '..';

// Define test contracts similar to the example
interface GreetingRequest {
  name: string;
}

interface GreetingResponse {
  message: string;
}

interface GreetingProgress {
  status: string;
  progress: number;
}

type Contract = CreateBridgeContract<{
  server: {
    greet: RpcMethodContract<
      GreetingRequest,
      GreetingResponse,
      GreetingProgress
    >;
    getData: RpcMethodContract<{ id: number }, { data: string }>;
  };
  client: {
    sayHello: RpcMethodContract<
      { name: string },
      { message: string },
      { progress: number }
    >;
  };
}>;

describe('sRPC Package', () => {
  // Server setup
  const httpServer = http.createServer();
  const server = createSRPCServerBridge<Contract>(httpServer);
  const TEST_PORT = 3001;

  // Original server method implementations to restore after tests
  let greetHandler: any;
  let getDataHandler: any;

  // Set up test server
  beforeAll(() => {
    return new Promise<void>((resolve) => {
      // Register server methods
      const greetImplementation = async (request: any, sendUpdate: any) => {
        sendUpdate({ status: 'Starting', progress: 0 });
        sendUpdate({ status: 'Processing', progress: 50 });
        sendUpdate({ status: 'Finishing', progress: 100 });
        return { message: `Hello, ${request.name}!` };
      };

      const getDataImplementation = async (request: any) => {
        return { data: `Data for ID ${request.id}` };
      };

      // Save original implementations
      greetHandler = greetImplementation;
      getDataHandler = getDataImplementation;

      server.register({
        greet: greetImplementation,
        getData: getDataImplementation,
      });

      // Start the server
      httpServer.listen(TEST_PORT, () => {
        resolve();
      });
    });
  });

  // Tear down test server
  afterAll(() => {
    return new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  // Client setup and tests
  describe('Client-Server Communication', () => {
    let client: ReturnType<typeof createSRPCClientBridge<Contract>>;

    beforeAll(async () => {
      client = createSRPCClientBridge<Contract>(`ws://localhost:${TEST_PORT}`);
      await client.connect();

      // Register client methods
      client.register({
        sayHello: async (request, sendUpdate) => {
          sendUpdate({ progress: 0 });
          sendUpdate({ progress: 50 });
          return { message: `Hello from client, ${request.name}!` };
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(() => {
      client.close();
    });

    it('should connect to the server successfully', () => {
      // Connection is already established in beforeAll
      expect(client).toBeDefined();
    });

    it('should call server methods and receive responses', async () => {
      const response = await client.call.greet({ name: 'Test User' });
      expect(response).toEqual({ message: 'Hello, Test User!' });
    });

    it('should call getData method and receive correct data', async () => {
      const testId = 42;
      const response = await client.call.getData({ id: testId });
      expect(response).toEqual({ data: `Data for ID ${testId}` });
    });

    it('should receive progress updates during method calls', async () => {
      const updateSpy = vi.fn();

      await client.call.greet({ name: 'Update Test' }, updateSpy);

      expect(updateSpy).toHaveBeenCalledTimes(3);
      expect(updateSpy).toHaveBeenCalledWith({
        status: 'Starting',
        progress: 0,
      });
      expect(updateSpy).toHaveBeenCalledWith({
        status: 'Processing',
        progress: 50,
      });
      expect(updateSpy).toHaveBeenCalledWith({
        status: 'Finishing',
        progress: 100,
      });
    });

    it('should be able to call client methods from server', async () => {
      const updateSpy = vi.fn();

      // Instead of trying to spy on the call method directly, verify with the update spy
      // that the method was called and had the correct behavior
      await server.call.sayHello({ name: 'Server' }, updateSpy);

      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).toHaveBeenCalledWith({ progress: 0 });
      expect(updateSpy).toHaveBeenCalledWith({ progress: 50 });
    });
  });

  describe('Error Handling', () => {
    let client: ReturnType<typeof createSRPCClientBridge<Contract>>;

    beforeAll(async () => {
      client = createSRPCClientBridge<Contract>(`ws://localhost:${TEST_PORT}`);
      await client.connect();
    });

    afterAll(() => {
      client.close();
    });

    it('should handle non-existent methods properly', async () => {
      // Create a type-safe way to test a non-existent method
      // by using a dynamic property with any cast
      const anyClient = client as any;
      const callNonExistent = () => anyClient.call.nonExistentMethod({});

      // Verify it throws an error
      await expect(callNonExistent).rejects.toThrow();
    });

    it('should handle server-side errors', async () => {
      // Save current implementation to restore later
      const originalImplementations = {
        greet: greetHandler,
        getData: getDataHandler,
      };

      // Register error-throwing implementation
      server.register({
        greet: async (request, sendUpdate) => {
          sendUpdate({ status: 'Starting', progress: 0 });
          sendUpdate({ status: 'Processing', progress: 50 });
          sendUpdate({ status: 'Finishing', progress: 100 });
          return { message: `Hello, ${request.name}!` };
        },
        getData: async () => {
          throw new Error('Test error');
        },
      });

      await expect(client.call.getData({ id: 1 })).rejects.toThrow(
        'Test error',
      );

      // Restore original methods by re-registering them
      server.register({
        greet: originalImplementations.greet,
        getData: originalImplementations.getData,
      });
    });
  });

  describe('Reconnection', () => {
    let client: ReturnType<typeof createSRPCClientBridge<Contract>>;

    beforeAll(async () => {
      client = createSRPCClientBridge<Contract>(`ws://localhost:${TEST_PORT}`, {
        maxReconnectAttempts: 3,
        reconnectDelay: 100,
      });
      await client.connect();
    });

    afterAll(() => {
      client.close();
    });

    it('should handle WebSocket reconnection properly', async () => {
      // Check that we can make a call
      const response1 = await client.call.greet({ name: 'Before Reconnect' });
      expect(response1).toEqual({ message: 'Hello, Before Reconnect!' });

      // Force close the existing connection (simulating a network issue)
      // Access the WebSocket through any type to bypass TypeScript protection
      const clientImpl = client as any;
      if (clientImpl.bridge?.ws) {
        clientImpl.bridge.ws.close();
      }

      // Wait a bit for reconnection to happen
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Try another call after reconnection
      const response2 = await client.call.greet({ name: 'After Reconnect' });
      expect(response2).toEqual({ message: 'Hello, After Reconnect!' });
    });
  });

  describe('Type Safety', () => {
    it('should enforce contract types at compile time', () => {
      // This test doesn't have runtime assertions but verifies TypeScript types
      // If this code compiles, the type system is working correctly

      type Expect<T extends true> = T;
      type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
        T,
      >() => T extends Y ? 1 : 2
        ? true
        : false;

      // Verify response type from greet method matches GreetingResponse
      async function testTypes() {
        const client = createSRPCClientBridge<Contract>('');
        const response = await client.call.greet({ name: 'Type Test' });

        type ResponseType = typeof response;
        type IsCorrectType = Expect<Equal<ResponseType, GreetingResponse>>;

        // This line will fail TypeScript compilation if types don't match
        const _typeCheck: IsCorrectType = true;
        return _typeCheck;
      }
    });
  });
});
