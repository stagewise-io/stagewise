/**
 * Dot-delimited command name, e.g. `"agents.sendMessage"` or
 * `"toolbox.answerUserQuestion"`. Matches the host's procedure naming
 * convention and makes later transport adapters (JSON-RPC, ACP) a direct
 * projection.
 */
export type CommandName = `${string}.${string}`;

/**
 * Context threaded through every command invocation. `callerId` is an
 * opaque string identifying the source of the call (e.g. `"ui"`, `"cli"`,
 * `"acp"`, or the host's procedure caller id). Handlers may use it for
 * authorization, telemetry, or routing. The registry does not interpret
 * `callerId`.
 */
export interface CommandContext {
  callerId: string;
}

/**
 * Command handler. Accepts the caller context and a typed argument payload,
 * returns a typed result.
 */
export type CommandHandler<TArgs = unknown, TResult = unknown> = (
  ctx: CommandContext,
  args: TArgs,
) => Promise<TResult>;

/** Thrown by `dispatch` when no handler is registered for the given name. */
export class UnknownCommandError extends Error {
  readonly command: string;
  constructor(command: string) {
    super(`Unknown command: ${command}`);
    this.name = 'UnknownCommandError';
    this.command = command;
  }
}

/** Thrown by `registerCommand` when the name is already registered. */
export class DuplicateCommandError extends Error {
  readonly command: string;
  constructor(command: string) {
    super(`Command already registered: ${command}`);
    this.name = 'DuplicateCommandError';
    this.command = command;
  }
}

/**
 * Typed registry of agent-core commands. Hosts register command handlers
 * at startup and invoke them via `dispatch`. This is the package-native
 * command seam — transport-agnostic and serializable by construction.
 */
export class CommandRegistry {
  private readonly handlers = new Map<CommandName, CommandHandler>();

  /**
   * Registers a command handler. Returns an unregister function. Throws
   * `DuplicateCommandError` if the name is already taken.
   */
  registerCommand<TArgs, TResult>(
    name: CommandName,
    handler: CommandHandler<TArgs, TResult>,
  ): () => void {
    if (this.handlers.has(name)) {
      throw new DuplicateCommandError(name);
    }
    this.handlers.set(name, handler as CommandHandler);
    return () => {
      if (this.handlers.get(name) === (handler as CommandHandler)) {
        this.handlers.delete(name);
      }
    };
  }

  /**
   * Invokes a registered command. Throws `UnknownCommandError` synchronously
   * if no handler is registered. Handler rejections propagate unchanged.
   */
  async dispatch<TArgs, TResult>(
    name: CommandName,
    ctx: CommandContext,
    args: TArgs,
  ): Promise<TResult> {
    const handler = this.handlers.get(name) as
      | CommandHandler<TArgs, TResult>
      | undefined;
    if (!handler) {
      throw new UnknownCommandError(name);
    }
    return handler(ctx, args);
  }

  /** Returns true if a handler is currently registered for `name`. */
  has(name: CommandName): boolean {
    return this.handlers.has(name);
  }

  /**
   * Returns all registered command names in registration order. Used by
   * the host-bridge drift check to verify that every procedure in the
   * contract has a matching handler.
   */
  list(): readonly CommandName[] {
    return Array.from(this.handlers.keys());
  }
}
