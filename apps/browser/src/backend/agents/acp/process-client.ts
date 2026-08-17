import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Readable, Writable } from 'node:stream';
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type ClientContext,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type SessionNotification,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
} from '@agentclientprotocol/sdk';
import type { Logger } from '@/services/logger';
import type { AcpAdapter } from './adapter';
import {
  prepareAcpProcess,
  spawnAgentProcess,
  terminateProcessTree,
} from './adapter';

const INITIALIZE_TIMEOUT_MS = 30_000;

interface AcpProcessHandlers {
  onSessionUpdate(notification: SessionNotification): void;
  onElicitation(
    request: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse>;
  onPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
}

export type ResolveAcpEnvironment = () => Promise<NodeJS.ProcessEnv | null>;

export class AcpProcessClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: ClientConnection | null = null;
  private nodeExecutable: string | null = null;

  public constructor(
    private readonly adapter: AcpAdapter,
    private readonly handlers: AcpProcessHandlers,
    private readonly logger: Pick<Logger, 'debug' | 'warn'>,
    private readonly resolveEnvironment: ResolveAcpEnvironment,
  ) {}

  public async start(approvalMode: string): Promise<InitializeResponse> {
    const shellEnv = (await this.resolveEnvironment()) ?? {};
    const { env, nodeExecutable, launch } = await prepareAcpProcess(
      this.adapter,
      {
        ...process.env,
        ...shellEnv,
      },
      approvalMode,
    );
    this.nodeExecutable = nodeExecutable;
    const child = spawnAgentProcess(launch.command, launch.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    this.child = child;
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) {
        this.logger.debug(`[${this.adapter.displayName} ACP] ${line}`);
      }
    });

    const app = client({ name: 'stagewise' })
      .onNotification(methods.client.session.update, ({ params }) => {
        this.handlers.onSessionUpdate(params);
      })
      .onRequest(methods.client.session.requestPermission, ({ params }) =>
        this.handlers.onPermission(params),
      )
      .onRequest(methods.client.elicitation.create, ({ params }) =>
        this.handlers.onElicitation(params),
      );
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const connection = app.connect(stream);
    this.connection = connection;
    child.once('error', (error) => this.handleExit(child, connection, error));
    child.once('exit', (code, signal) => {
      this.handleExit(
        child,
        connection,
        new Error(
          `${this.adapter.displayName} ACP exited (${signal ?? `code ${String(code)}`})`,
        ),
      );
    });
    void connection.closed.then(() => this.handleConnectionClosed(connection));

    try {
      return await withTimeout(
        connection.agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {
            plan: {},
            elicitation: { form: {} },
            session: { configOptions: { boolean: {} } },
          },
          clientInfo: {
            name: 'stagewise',
            title: 'stagewise',
            version: __APP_VERSION__,
          },
        }),
        INITIALIZE_TIMEOUT_MS,
        `${this.adapter.displayName} ACP initialization timed out`,
      );
    } catch (error) {
      this.close();
      throw error;
    }
  }

  public newSession(request: NewSessionRequest): Promise<NewSessionResponse> {
    return this.requireAgent().request(methods.agent.session.new, request);
  }

  public resumeSession(
    request: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    return this.requireAgent().request(methods.agent.session.resume, request);
  }

  public setConfigOption(
    request: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    return this.requireAgent().request(
      methods.agent.session.setConfigOption,
      request,
    );
  }

  public prompt(request: PromptRequest): Promise<PromptResponse> {
    return this.requireAgent().request(methods.agent.session.prompt, request);
  }

  public async cancel(sessionId: string): Promise<void> {
    await this.connection?.agent.notify(methods.agent.session.cancel, {
      sessionId,
    });
  }

  public close(): void {
    const child = this.child;
    this.child = null;
    this.connection?.close();
    this.connection = null;
    this.nodeExecutable = null;
    child?.stdin.end();
    if (!child) return;
    terminateProcessTree(child);
  }

  public isRunning(): boolean {
    return this.child !== null && this.connection !== null;
  }

  public getNodeExecutable(): string {
    if (!this.nodeExecutable) throw new Error('ACP process is not started');
    return this.nodeExecutable;
  }

  private requireAgent(): ClientContext {
    if (!this.connection) throw new Error('ACP process is not connected');
    return this.connection.agent;
  }

  private handleExit(
    child: ChildProcessWithoutNullStreams,
    connection: ClientConnection,
    error: Error,
  ): void {
    if (this.child !== child) return;
    this.child = null;
    this.connection = null;
    this.nodeExecutable = null;
    connection.close(error);
  }

  private handleConnectionClosed(connection: ClientConnection): void {
    if (this.connection !== connection) return;
    this.logger.warn(`[${this.adapter.displayName} ACP] connection closed`);
    this.close();
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
