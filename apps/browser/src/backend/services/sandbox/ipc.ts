/**
 * Duck-typed interface for an Electron UtilityProcess instance on the main side.
 * Using a structural type avoids importing 'electron' directly, which would
 * break the separately-bundled worker script.
 */
interface UtilityProcessHandle {
  postMessage(msg: any): void;
  on(event: 'message', handler: (data: any) => void): this;
  on(event: string, handler: (...args: any[]) => void): this;
}

export type MountPermission = 'read' | 'list' | 'create' | 'edit' | 'delete';

export const FULL_PERMISSIONS: MountPermission[] = [
  'read',
  'list',
  'create',
  'edit',
  'delete',
];
export const READ_ONLY_PERMISSIONS: MountPermission[] = ['read', 'list'];
export const APPEND_ONLY_PERMISSIONS: MountPermission[] = [
  'read',
  'list',
  'create',
];

export const NON_WORKSPACE_PREFIXES = new Set([
  'att',
  'plugins',
  'logs',
  'shells',
]);

export interface MountDescriptor {
  prefix: string;
  absolutePath: string;
  permissions: MountPermission[];
}

export type MainToWorkerMessage =
  | { type: 'create-context'; agentId: string }
  | { type: 'destroy-context'; agentId: string }
  | { type: 'execute'; id: string; agentId: string; code: string }
  | { type: 'cdp-result'; id: string; result?: unknown; error?: string }
  | {
      type: 'update-mounts';
      agentId: string;
      mounts: MountDescriptor[];
    }
  | {
      type: 'credential-result';
      id: string;
      data: Record<string, string> | null;
      /** [placeholder, value, allowedOrigins][] */
      secretEntries?: [string, string, string[]][];
      error?: string;
    }
  | {
      type: 'create-attachment-result';
      id: string;
      /** Canonical disk filename (blob key) returned to the agent */
      fileName?: string;
      error?: string;
    }
  | {
      type: 'open-app-result';
      id: string;
      success: boolean;
      error?: string;
    }
  | {
      type: 'close-app-result';
      id: string;
      success: boolean;
      error?: string;
    }
  | {
      type: 'send-app-message-result';
      id: string;
      success: boolean;
      error?: string;
    }
  | {
      type: 'app-message-received';
      agentId: string;
      appId: string;
      pluginId?: string;
      data: unknown;
    }
  | {
      type: 'cdp-event';
      agentId: string;
      tabId: string;
      event: string;
      params: unknown;
    };

export type WorkerToMainMessage =
  | {
      type: 'cdp';
      id: string;
      tabId: string;
      method: string;
      params?: Record<string, unknown>;
    }
  | {
      type: 'result';
      id: string;
      value?: unknown;
      error?: string;
      errorStack?: string;
      outputs?: string[];
    }
  | {
      type: 'file-diff-notification';
      agentId: string;
      absolutePath: string;
      before: string | null;
      after: string | null;
      isExternal: boolean;
      bytesWritten: number;
    }
  | {
      type: 'sandbox-output';
      agentId: string;
      output: string;
    }
  | {
      /** Agent calls API.createAttachment() — main process writes the blob and returns the canonical fileName */
      type: 'create-attachment';
      id: string;
      agentId: string;
      originalFileName: string;
      /** base64-encoded file content */
      data: string;
    }
  | {
      type: 'resolve-credential';
      id: string;
      agentId: string;
      typeId: string;
    }
  | {
      type: 'open-app';
      id: string;
      agentId: string;
      appId: string;
      pluginId?: string;
      height?: number;
    }
  | {
      type: 'close-app';
      id: string;
      agentId: string;
    }
  | {
      type: 'send-app-message';
      id: string;
      agentId: string;
      appId: string;
      pluginId?: string;
      data: unknown;
    }
  | {
      type: 'subscribe-cdp-event';
      agentId: string;
      tabId: string;
      event: string;
    }
  | {
      type: 'unsubscribe-cdp-event';
      agentId: string;
      tabId: string;
      event: string;
    };

/** Main-side: typed send + onMessage for a UtilityProcess child */
export function createMainIPC(child: UtilityProcessHandle) {
  return {
    send(msg: MainToWorkerMessage) {
      child.postMessage(msg);
    },
    onMessage(handler: (msg: WorkerToMainMessage) => void) {
      child.on('message', handler);
    },
  };
}

/** Worker-side: typed send + onMessage via process.parentPort (Electron Utility Process) */
export function createWorkerIPC() {
  // In an Electron utility process, process.parentPort is the IPC channel to the main process.
  // It's not exported from the 'electron' module — it's a property on the process object.
  const parentPort = (process as any).parentPort as {
    postMessage(msg: any): void;
    on(
      event: 'message',
      handler: (e: { data: any; ports: any[] }) => void,
    ): void;
  };

  if (!parentPort) {
    throw new Error(
      'process.parentPort is not available. ' +
        'This script must be spawned via Electron utilityProcess.fork().',
    );
  }

  return {
    send(msg: WorkerToMainMessage) {
      parentPort.postMessage(msg);
    },
    onMessage(handler: (msg: MainToWorkerMessage) => void) {
      // parentPort 'message' event wraps data in { data, ports }
      parentPort.on('message', (e) => handler(e.data));
    },
  };
}
