# Specification of Project "Karton"

## General

- Project name: Karton
- Package name: "@stagewise/karton"
- Language: TypeScript only
- Public npm package: yes
- Package manager: pnpm
- Build toolchain: esbuild
- Zero bundled dependencies (except type definitions for dev and Immer for state mutation)
- High quality requirement. Well tested core, RPC, state change and synchronization mechanism.

## Use case

- Karton is used to connect two or more JavaScript applications together in order to share state and RPC functionality between them.
- One (exactly 1) app acts as the server and has the ownership and sole write permissions to the state that is shared between the apps.
- One or more apps act as clients and are synchronized to the server state. Clients only read shared application state but are able to call procedures located on the server.
- The server may call procedures in clients. All clients offer the exact same procedures and when calling a client procedure, the server app must specific which client should be called.

## Terminology

- Server: The application that hosts the master replica of the application state
- Client: One or more applications that synchronize with the state of the server.
- State: The data object that contains the whole application state and get's synchronized from the server to all clients.
- AppType: The shared state and procedures types for an app. Both server and client use the same type to know how the state looks like and what procedures can be called.
- RPC: "Remote Procedure Calling". Describes the process of the client calling server functions as if they're available locally or vice versa.

## Required dependencies

### State mutation: Immer

- In order to modify state server-side and generate a synchronizable delta for all changes made, "Immer" should be used
- Immer can document and replicate changes by using so called "Patches", which resemble the capabilitis of JSON patches.
- Users should change server side state with Immer, and the resulting patches should be synced and applied to the read-only client-side state.

### (De-)Serialization: SuperJSON

- All (de-)serialization should happen with SuperJSON in order to allow serialization of types like Date, void, undefined etc.

### Server-Client communication: WebSocket

- Karton uses the Node.js and Browser built-in WebSocket capabilities in order to synchronize data between server and client

## Requirements

### Package structure

- The project should be distributed offered as one single package
- The project should provide three exported main modules for the user:
  - "/shared": Type helpers etc. that may be necessary or recommended for type definition of the data store and RPC function types
  - "/server": All objects and tools needed to start the server side of Karton
  - "/client": All objects and tools needed to start the client side of Karton
  - "/react/client": A layer on top of the vanilla JS Karton client that makes Karton easier to use in React components
- Make sure that the Server and Client side main modules don't import each other, though they may use shared internal modules

### Setup in consumer projects

#### Shared type definitions

- The user should define the type of the state object and all RPC functions located on either server side or client side app as TypeScript types.
- The user uses these shared type definitions as well as the individual modules for server and client apps to instantiate each side of Karton.
- Thanks to the use of proxies in both server and client, users can only share the type definiton which will be leveraged to generate type-safe usage.

#### Server side setup

- The user sets up Karton by calling the type generic function `createKartonServer`
  - The function receives the following configuration as a config objct argument:
    - The express app and the http server that will host the WebSocket
    - The path on which the WebSocket will be made available
    - All function implementations for server-side procedures that clients can call later on
- Said function receives a reference to the express app into which it registers the websocket route handler

#### Client side setup

- The user instantiates a single service in the UI application by calling the type generic function `createKartonClient`
  - The function receives the following configuration as a config object argument:
    - Path under which the Karton server is reachable
    - All function implementations for client-side procedure that the server can call later on
  - The function generic type parameter is the shared AppType for the Karton instance
  - The function returns a single client that then offers read-only access to the state as well as access to all server-side procedures that can be called.

##### React setup

- The user uses the type generic function `createKartonReactClient`
  - The configuration looks the same as for the vanilla client
  - The function returns a tuple with the following objects:
    - A Provider component that hosts the client (`KartonProvider`)
    - A hook that exposes state and/or server-side procedures that the user can read or call

### Shared state

- Server and client share a common state
- Only server can mutate state
- Client can only read state
- State can be an arbitrarily complex object consisting of entries that are serializable with SuperJSON
- State cannot contain functions

### RPC support

- Both clients and servers can make procedures call to the procedures available on the other side
- RPC calls are identified by a random ID across server and client
- If a RPC throws, the runtime of where the procedure is actually executed must catch any exception, wrap it in a RPCException websocket message, and send it over.
  - The caller side will then re-throw the exception
- Every procedure is asynchronous
- A procedure can receive any serializable data as a parameter and can return anything serializable
- Procedures can be called multiple times at once and the lifecycle of every procedure call is tracked through it's call ID.
- The server must always define on which client a procedure shoudl be called, since there may be multiple connected clients.
- The server always receives the cliebt ID that executed a server procedure as a trailing argument to any implemented function in order to know which client made the call.
- If a procedure call is made while the server is unavailable or the specified client is unavailable, a dedicated Error should be thrown.

### Multi-Client compatibility

- The server can accept multiple clients at once
- On the server, every connected client is listed in a list of connected client IDs
- On initial connection of a new client, the server will generate a unique client ID to identify the client that operates through the given connection
- When a connection closes, the client will be removed out of the list of existing clients
- The client ID doesn't have to be communication with the cliebt itself. It only serves as a lookup key for every connected client inside the server.
- Besides the state patch messages, every essage transmitted over Karton should only be transmitted to the specific client instead of being broadcasted.

### Synchronization mechanism

- On initial connect, the server will proactively send out the current state of the app to the newly connected client
- Whenever any change to the state is made, the generated patch will be serialized and send over to every connected client.
- The client should apply the patch to it's local copy upon reception of a patch.
- Unlike other messages, patches are always broadcasted to all connected clients.

### Connection recovery

- Upon disconnect, the client should retry reconnecting to the websocket server every 500ms.

### React compatibility for UI app

- Because most UI apps will most likely will operate with React, it's of utmost importance that the package also offers a React 19 compatible package.
- The React compatibility layer should use the vanilla UI-side client as a base.
- The React compatibility package should offer one Provider "StateSyncerProvider" and one hook "useStateSyncer"
- Both the Provider and useStateSyncer are generics and should be made type-safe by passing in the type definitions for the data store and the RPC functions.
- The user needs an easy way to instantiate the provider and use the hooks typesafe by defining them type-safely in one place.
- The StateSyncerProvider should host the vanilla UI-side client as well as all necessary additional data to make the "useStateSyncer" hook work.
- The "useStateSyncer" hook uses the context provided by the "StateSyncerProvider" and then provides efficient re-rendering logic to not result in unnecessary re-renders.
  - The hook should offer one parameter, with which parts of the state-syncer should be selectable. The hook should only trigger a re-render when the selected parts have been changed/updated.
  - The API should look very similar to "Zustand" which allows to select only certain parts of the defined Zustand store and then only re-renders if needed.
  - RPC functions should also be selectable through the same mechanism, by allowing the user to select from both all available RPC functions and parts of the data store.
  - RPC functions are always async. They resolve once the result was returned and they should throw if the executed function threw.

## Interface definitions

### Type definitions

```ts
interface AppType {
  state: {}; // This is required and represents the strcutre of the state that get's ynced through Karton. Entries in here can't be functions.
  serverProcedures?: { // This is optional and contains a set or (arbitrarily deep-nested) functions that are located on the server-side. Every entry in here must either be an object or an !async! function.
    testProcedure: (dummyArg1: string, dummyArg2: number) => Promise<void>;
    subPath: {
      nestedProcedure: () => Promise<boolean>;
    }
  };
  clientProcedures?: { // This is optional and contains a set or (arbitrarily deep-nested) functions that are located on the client-side. Every entry in here must either be an object or an !async! function.
    testProcedure: (dummyArg1: string, dummyArg2: number) => Promise<void>;
    subPath: {
      nestedProcedure: () => Promise<boolean>;
    }
  };
}
```

### Server side

#### Instantiation

```ts
// Make sure that the AppType that's passed in get's statically checked for the correct base struture.
interface KartonServerConfig<AppType> {
  expressApp: App; // Express App type
  httpServer: HttpServer; // Node.js built-in http server type
  webSocketPath: string; // Path under which the websocket for Karton will be made available in the express app
  procedures: KartonServerProcedureImplementations<AppType>; // All the implementations for the server procedures. Every defined procedure must be implemented. The helper type extracts the required procedures from the AppType and add's a trailing argument to every procedure called "callingClientId" which is a string with the client ID that made the call to the procedure.
  initialState: KartonState<AppType>; // The initial state of the Karton server
}

interface KartonServer<AppType> {
  state: KartonState<AppType>; // Read-only access to the state that's currently stored in the karton
  setState: ((recipe: (draft: KartonState<AppType>) => void) => KartonState<AppType>) // Function that updates the state. This looks just like the "produce" function that Immer provides, although the user doesn't have to provide the base state as there is only one base state that get's modified. The return value is the updated state that will also be made available as state in the KartonServer itself.
  clientProcedures: KartonClientProcedures<AppType>; // Client-side procedures that the server might call
  connectedClients: string[]; // A read-only list of clients IDs that are connected
}

type CreateKartonServer = <AppType>(config: KartonServerConfig<AppType>): Promise<KartonServer<AppType>>; // Can be async if necessary in implementation

const createKartonServer: CreateKartonServer<AppType>;
```

#### State reading

```ts
const kartonServer = await createKartonServer(...);

const dummyState = kartonServer.state.dummyStateEntry;
```

#### State changes

```ts
const kartonServer = await createKartonServer(...);

const newState = kartonServer.setState((state) => {
  state.dummyStateEntry++;
  }); // The new state will also be immediately available through kartonServer.state
```

#### Remote Procedure Calls

In order to call procedures located on the client, the server side does the following:

```ts
const kartonServer = await createKartonServer(...);

// Every RPC procedure is always asynchronous
const result = await kartonServer.clientProcedures.dummyProcedure(clientId, arg1, arg2, ...); // The first argument must always be the mandatory clientId, while the following arguments represent the arguments for the defined function.

// The RPC call should fail with a "KartonRPCException" if the client ID is unknown or if the client can't be reached.
```

### Client side

#### Instantiation

```ts
// Make sure that the AppType that's passed in get's statically checked for the correct base struture.
interface KartonClientConfig<AppType> {
  webSocketPath: string; // Path under which the websocket for Karton is reachable
  procedures: KartonClientProcedures<AppType>; // All the implementations for the client procedures. Every defined procedure must be implemented. The helper type extracts the required procedures from the AppType.
  fallbackState: KartonState<AppType>; // This state will be reported when no server is connected
}

interface KartonClient<AppType> {
  state: KartonState<AppType>; // Read-only access to the state that's currently stored in the karton
  serverProcedures: KartonServerProcedures<AppType>; // Server-side procedures that the client might call
  isConnected: boolean; // Reports the connection state
}

type CreateKartonClient = <AppType>(config: KartonClientConfig<AppType>): KartonClient<AppType>; // Should be non-async

const createKartonClient: CreateKartonClient<AppType>;
```

#### State reading

```ts
const kartonClient = await createKartonClient(...);

const dummyState = kartonClient.state.dummyStateEntry;
```

#### Remote Procedure Calls

```ts
const kartonServer = await createKartonServer(...);

// Every RPC procedure is always asynchronous
const result = await kartonServer.serverProcedures.dummyProcedure(...); // The arguments are exactly as in the definition, since there is only one server to call.

// The RPC call should fail with a "KartonRPCException" if the client ID is unknown or if the client can't be reached.
```

#### React Provider

```ts
type KartonClientProvider = (props: {children?: ReactNode}) => ReactNode;

type KartonHookSelector = (state, serverProcedures, isConnected) => unknown; // The selector returns a slice of the state, a serverPreocedure to call or the isConnected state.

type KartonHook = (selector: KartonHookSelector) => unknown; // The hook returns one of the data based on the stuff selected by the selector. It will only re-rendered when the selected data was changed (similar to Zustand state slice selectors)

type CreateKartonReactClient = <AppType>(config: KartonClientConfig<AppType>): [KartonClientProvider, KartonHook]; // Should be non-asnyc and returns a tuple with provider and hook that can be exported from some central karton utility file

const createKartonReactClient: CreateKartonReactClient<AppType>;

```

#### React Hook

```ts
const isKartonConnected = useKartonCnnected;

const dummyStateEntry = useKartonState((state) => state.dummyStateEntry);

const dummyServerProcedure = useKartonProcedure((serverProcedures) => serverProcedures.dummyServerProcedure);
```

The react hook should only trigger re-rendering when the value of the actually selected slice of the state changes in order to prevent unnecessary re-renders.

When the users selects a procedure, the hook should never trigger a re-render.

When the user selected the `isConnected` entry, it should only re-render when the connection state actually changes.

## Error definitions

### KartonRPCException

The `KartonRPCException` is a custom error class that is thrown when RPC calls fail due to connection or availability issues. This exception is **only** used for connection-related failures, not for errors that occur during procedure execution.

When a procedure throws an error during its execution, that original error is serialized via the `rpc_exception` WebSocket message and re-thrown as-is on the caller side, preserving the original error type and message.

```ts
enum KartonRPCErrorReason {
  CONNECTION_LOST = 'CONNECTION_LOST', // WebSocket connection to server/client was lost
  CLIENT_NOT_FOUND = 'CLIENT_NOT_FOUND', // Specified client ID does not exist in connected clients
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE', // Server is not reachable/connected
}

class KartonRPCException extends Error {
  public readonly reason: KartonRPCErrorReason;
  public readonly procedurePath: string[]; // Path to the procedure that was being called
  public readonly clientId?: string; // Client ID involved in the failed call (if applicable)
  
  constructor(
    reason: KartonRPCErrorReason,
    procedurePath: string[],
    clientId?: string
  ) {
    const procedureName = procedurePath.join('.');
    let message: string;
    
    switch (reason) {
      case KartonRPCErrorReason.CONNECTION_LOST:
        message = `RPC call to '${procedureName}' failed: Connection lost`;
        break;
      case KartonRPCErrorReason.CLIENT_NOT_FOUND:
        message = `RPC call to '${procedureName}' failed: Client '${clientId}' not found`;
        break;
      case KartonRPCErrorReason.SERVER_UNAVAILABLE:
        message = `RPC call to '${procedureName}' failed: Server unavailable`;
        break;
    }
    
    super(message);
    this.name = 'KartonRPCException';
    this.reason = reason;
    this.procedurePath = procedurePath;
    this.clientId = clientId;
  }
}
```

#### Usage scenarios

1. **Client calling server procedure when disconnected:**

   ```ts
   // Throws KartonRPCException with reason: SERVER_UNAVAILABLE
   await kartonClient.serverProcedures.someProcedure();
   ```

2. **Server calling client procedure with unknown client ID:**

   ```ts
   // Throws KartonRPCException with reason: CLIENT_NOT_FOUND
   await kartonServer.clientProcedures.someProcedure('unknown-client-id', ...args);
   ```

3. **Server calling client procedure when client disconnected:**

   ```ts
   // Throws KartonRPCException with reason: CONNECTION_LOST
   await kartonServer.clientProcedures.someProcedure('disconnected-client-id', ...args);
   ```

4. **Procedure execution errors (NOT KartonRPCException):**

   ```ts
   // If the remote procedure throws a TypeError, that same TypeError
   // is re-thrown on the caller side, NOT wrapped in KartonRPCException
   try {
     await kartonClient.serverProcedures.someProcedure();
   } catch (error) {
     // error is the original error from the server, e.g., TypeError, ReferenceError, etc.
   }
   ```

## WebSocket Message structure

- Depending on the action, different message types should be sent
- Messages are based on JSON
- Messages are serialized and de-serialized with SuperJSON
- All Messages have a top-level type definition, defined below

```ts
interface WebSocketMessage {
  type: 'rpc_call' | 'rpc_return' | 'rpc_exception' | 'state_sync' | 'state_patch'; // The basic type of the message
  data: RPCCallData | RPCReturnData | RPCExceptionData | StateSyncData | StatePatchData; // The data content of the message
}
```

### RPC

#### Procedure call

- Message type: `rpc_call`

- Message data type:

  ```ts
  interface RPCCallData {
    rpcCallId: string; // Random ID that unqiuely identifies the given RPC call. Must be highly unique.
    procedurePath: string[]; // A array of sub-paths that leads to the correct procedure that should be called
    parameters: []; // Tuple with all parameters for the function
  }
  ```

- Message direction: Bi-Directional

- Gets sent when the procedure initially get's invoked

#### Procedure returns

- Message type: `rpc_return`
- Message data type:

  ```ts
  interface RPCReturnData {
    rpcCallId: string; // Identifier of the rpc call
    value: unknown; // Return value of the procedure
  }
  ```

- Message direction: Bi-Directional
- Gets sent when the procedure finishes and returns

#### Procedure exceptions

- Message type: `rpc_exception`
- Message data type:

  ```ts
  interface RPCExceptionData<E extends Error> {
    rpcCallId: string; // Identifier of the rpc call
    error: Error; // The specific error
  }
  ```

- Message direction: Bi-Directional
- Get's sent when a specific rpc call throws. Will re-throw the error on the caller side.

#### State synchronization

- Message type: `state_sync`
- Message data type:

  ```ts
  interface StateSyncData {
    state: unknown; // This should contain the full state that is currently on the server
  }
  ```

- Message direction: Only server to client
- Get's sent when a client initially connects to the server and needs an initial full image of the state

#### State patching

- Message type: `state_patch`
- Message data type:

  ```ts
  interface StatePatchData {
    patch: unknown; // This is the patch data that Immer generated
  }
  ```

- Message direction: Only server to client
- Get's sent to all clients when modifications happen to the state on the server
