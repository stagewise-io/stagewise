import { tool } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  askUserQuestionsToolInputSchemaFlat,
  type AskUserQuestionsToolInput,
  type AskUserQuestionsToolOutput,
  type QuestionAnswerValue,
} from '@shared/karton-contracts/ui/agent/tools/types';
import type { KartonService } from '@/services/karton';

export const DESCRIPTION = `Ask the user structured questions via a multi-step form.

User this tool instead of asking questions in plain text when you need structured, unambiguous answers. The form blocks execution until the user submits or cancels.

**NEVER** MAKE MULTIPLE CALLS TO THIS TOOL AT ONCE. Put all questions into one call with individual steps instead.

Radio groups always include an "Other" free-text option; custom answers are prefixed with \`__other__:\`.
If the user dismisses the form by typing a message, the tool returns with completed=false, any partial answers, and a notice. The user's message arrives as a normal user message immediately after this tool result.

Best practices:
- Keep forms short (1-3 fields per step) and use steps to reduce cognitive load.
- Labels and descriptions support **markdown**. Use it for clarity.
- Do NOT use this tool for simple yes/no confirmations that can be asked in plain text.
`;

type Deferred = {
  resolve: (value: AskUserQuestionsToolOutput) => void;
  agentInstanceId: string;
};

/** Active deferred promises keyed by question ID */
const pendingQuestions = new Map<string, Deferred>();

/** Map from agentInstanceId to active questionId */
const agentQuestionMap = new Map<string, string>();

export function advanceOrCompleteQuestion(
  questionId: string,
  stepAnswers: Record<string, QuestionAnswerValue>,
  uiKarton: KartonService,
  agentInstanceId: string,
): void {
  const deferred = pendingQuestions.get(questionId);
  if (!deferred) return;

  const toolboxEntry = uiKarton.state.toolbox[agentInstanceId];
  if (!toolboxEntry?.pendingUserQuestion) return;

  const question = toolboxEntry.pendingUserQuestion;
  const mergedAnswers = { ...question.answers, ...stepAnswers };
  const nextStep = question.currentStep + 1;

  if (nextStep >= question.steps.length) {
    // All steps completed — resolve the promise
    pendingQuestions.delete(questionId);
    agentQuestionMap.delete(agentInstanceId);

    uiKarton.setState((draft) => {
      const entry = draft.toolbox[agentInstanceId];
      if (entry) entry.pendingUserQuestion = null;
    });

    deferred.resolve({
      completed: true,
      cancelled: false,
      answers: mergedAnswers,
      completedSteps: question.steps.length,
    });
  } else {
    // Advance to next step
    uiKarton.setState((draft) => {
      const entry = draft.toolbox[agentInstanceId];
      if (entry?.pendingUserQuestion) {
        entry.pendingUserQuestion.currentStep = nextStep;
        entry.pendingUserQuestion.answers = mergedAnswers;
      }
    });
  }
}

export function cancelQuestion(
  questionId: string,
  reason: 'user_cancelled' | 'user_sent_message' | 'agent_stopped',
  uiKarton: KartonService,
  agentInstanceId: string,
  draftAnswers?: Record<string, QuestionAnswerValue>,
): void {
  const deferred = pendingQuestions.get(questionId);
  if (!deferred) return;

  const toolboxEntry = uiKarton.state.toolbox[agentInstanceId];
  const completedSteps = toolboxEntry?.pendingUserQuestion?.currentStep ?? 0;
  const submittedAnswers = toolboxEntry?.pendingUserQuestion?.answers ?? {};
  // Merge submitted step answers with the current step's draft values
  const answers = { ...submittedAnswers, ...draftAnswers };

  pendingQuestions.delete(questionId);
  agentQuestionMap.delete(agentInstanceId);

  uiKarton.setState((draft) => {
    const entry = draft.toolbox[agentInstanceId];
    if (entry) entry.pendingUserQuestion = null;
  });

  if (reason === 'user_sent_message') {
    // Return partial answers with a notice instead of marking as cancelled.
    // The user's actual message is queued in the same step.
    deferred.resolve({
      completed: false,
      cancelled: false,
      answers,
      completedSteps,
      notice:
        'User sent a message while responding to questions. Read the user message that follows this tool result.',
    });
  } else {
    deferred.resolve({
      completed: false,
      cancelled: true,
      cancelReason: reason,
      answers,
      completedSteps,
    });
  }
}

export function goBackQuestion(
  questionId: string,
  uiKarton: KartonService,
  agentInstanceId: string,
): void {
  const toolboxEntry = uiKarton.state.toolbox[agentInstanceId];
  if (!toolboxEntry?.pendingUserQuestion) return;
  if (toolboxEntry.pendingUserQuestion.id !== questionId) return;
  if (toolboxEntry.pendingUserQuestion.currentStep <= 0) return;

  uiKarton.setState((draft) => {
    const entry = draft.toolbox[agentInstanceId];
    if (entry?.pendingUserQuestion) {
      entry.pendingUserQuestion.currentStep -= 1;
    }
  });
}

export function cleanupQuestionsForAgent(
  agentInstanceId: string,
  uiKarton: KartonService,
): void {
  const questionId = agentQuestionMap.get(agentInstanceId);
  if (!questionId) return;
  cancelQuestion(questionId, 'agent_stopped', uiKarton, agentInstanceId);
}

export const askUserQuestions = (
  uiKarton: KartonService,
  agentInstanceId: string,
) => {
  return tool({
    description: DESCRIPTION,
    inputSchema: askUserQuestionsToolInputSchemaFlat,
    strict: false,
    execute: async (flatParams) => {
      const params = flatParams as unknown as AskUserQuestionsToolInput;

      // Cancel any existing pending question for this agent before creating
      // a new one, so the old deferred promise doesn't leak.
      cleanupQuestionsForAgent(agentInstanceId, uiKarton);

      const questionId = randomUUID();

      // Ensure toolbox entry exists
      if (!uiKarton.state.toolbox[agentInstanceId]) {
        uiKarton.setState((draft) => {
          draft.toolbox[agentInstanceId] = {
            workspace: { mounts: [] },
            pendingFileDiffs: [],
            editSummary: [],
            pendingUserQuestion: null,
          };
        });
      }

      // Set the pending question in karton state and mark agent as unread
      // so the active-agents UI shows a notification pulse.
      uiKarton.setState((draft) => {
        const entry = draft.toolbox[agentInstanceId];
        if (entry) {
          entry.pendingUserQuestion = {
            id: questionId,
            title: params.title,
            description: params.description,
            steps: params.steps,
            currentStep: 0,
            answers: {},
          };
        }
        const agent = draft.agents.instances[agentInstanceId];
        if (agent) {
          agent.state.unread = true;
        }
      });

      // Create deferred promise
      const result = await new Promise<AskUserQuestionsToolOutput>(
        (resolve) => {
          pendingQuestions.set(questionId, {
            resolve,
            agentInstanceId,
          });
          agentQuestionMap.set(agentInstanceId, questionId);
        },
      );

      return result;
    },
  });
};
