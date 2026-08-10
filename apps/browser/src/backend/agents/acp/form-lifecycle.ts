type JsonObject = Record<string, unknown>;

export interface StagewiseInputResult {
  completed: boolean;
  cancelled: boolean;
  answers: Record<string, string | number | boolean | string[]>;
  completedSteps?: number;
}

const CANCELLED_RESULT: StagewiseInputResult = {
  completed: false,
  cancelled: true,
  answers: {},
  completedSteps: 0,
};

export class StagewiseFormLifecycle {
  private readonly pending = new Map<string, () => void>();

  public constructor(
    private readonly requestUserInput: (input: unknown) => Promise<unknown>,
    private readonly cancelUserInput: () => void,
    private readonly updatePart: (
      id: string,
      part: Record<string, unknown>,
    ) => void,
  ) {}

  public async request(
    formInput: JsonObject,
    toolCallId: string,
    signal?: AbortSignal,
  ): Promise<StagewiseInputResult> {
    this.updatePart(toolCallId, {
      type: 'tool-askUserQuestions',
      toolCallId,
      state: 'input-available',
      input: formInput,
    });

    let cancel!: () => void;
    const cancelled = new Promise<StagewiseInputResult>((resolve) => {
      cancel = () => resolve(CANCELLED_RESULT);
    });
    const abort = () => {
      this.cancelUserInput();
      cancel();
    };
    this.pending.set(toolCallId, cancel);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();

    let result: StagewiseInputResult;
    try {
      const userInput = signal?.aborted
        ? cancelled
        : (this.requestUserInput(formInput) as Promise<StagewiseInputResult>);
      result = (await Promise.race([
        userInput,
        cancelled,
      ])) as StagewiseInputResult;
    } finally {
      signal?.removeEventListener('abort', abort);
      this.pending.delete(toolCallId);
    }

    const normalized = {
      ...result,
      completedSteps:
        result.completedSteps ??
        (result.completed && Array.isArray(formInput.steps)
          ? formInput.steps.length
          : 0),
    };
    this.updatePart(toolCallId, {
      type: 'tool-askUserQuestions',
      toolCallId,
      state: 'output-available',
      input: formInput,
      output: normalized,
    });
    return normalized;
  }

  public cancelAll(): void {
    this.cancelUserInput();
    for (const cancel of this.pending.values()) cancel();
    this.pending.clear();
  }
}
