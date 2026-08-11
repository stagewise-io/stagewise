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
  private active: { toolCallId: string; cancel(): void } | null = null;

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
    if (signal?.aborted || this.active) {
      return this.publishResult(toolCallId, formInput, CANCELLED_RESULT);
    }
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
      if (this.active?.toolCallId === toolCallId) this.cancelUserInput();
      cancel();
    };
    this.active = { toolCallId, cancel };
    signal?.addEventListener('abort', abort, { once: true });

    let result: StagewiseInputResult;
    try {
      const userInput = this.requestUserInput(
        formInput,
      ) as Promise<StagewiseInputResult>;
      result = (await Promise.race([
        userInput,
        cancelled,
      ])) as StagewiseInputResult;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.active?.toolCallId === toolCallId) this.active = null;
    }

    return this.publishResult(toolCallId, formInput, result);
  }

  private publishResult(
    toolCallId: string,
    formInput: JsonObject,
    result: StagewiseInputResult,
  ): StagewiseInputResult {
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
    if (!this.active) return;
    this.cancelUserInput();
    this.active.cancel();
    this.active = null;
  }
}
