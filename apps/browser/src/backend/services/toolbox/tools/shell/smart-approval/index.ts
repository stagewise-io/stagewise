import type { ModelId } from '@shared/available-models';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  deepMergeProviderOptions,
  type ModelProviderService,
} from '@/agents/model-provider';
import type { TelemetryService } from '@/services/telemetry';
import { SMART_APPROVAL_SYSTEM_PROMPT } from './prompt';

/**
 * Ordered list of model IDs to try for smart-approval classification.
 * The first model is the primary; subsequent entries are fallbacks tried
 * in order when the previous one fails or times out. Mirrors the
 * title-generation fallback chain so BYOK users are covered regardless
 * of which provider they have configured.
 */
export const SMART_APPROVAL_MODELS: readonly ModelId[] = [
  'gemini-3.1-flash-lite',
  'gpt-5.4-nano',
  'claude-haiku-4.5',
];

/**  Maximum time (ms) allowed for a single classification attempt. */
const SMART_APPROVAL_TIMEOUT_MS = 8_000;

export const smartApprovalSchema = z.object({
  needsApproval: z
    .boolean()
    .describe(
      'True if this command should require explicit user approval before execution.',
    ),
  explanation: z
    .string()
    .min(10)
    .max(200)
    .describe(
      'One short sentence. When needsApproval is true, explain the risk concisely. When false, describe why it is safe.',
    ),
});

export type SmartApprovalResult = z.infer<typeof smartApprovalSchema>;

export interface ClassifyShellCommandInput {
  command: string;
  /**
   * Short mount prefix the agent passed in (e.g. `w1e07` or
   * `w1e07/apps/browser`). Sent to the classifier in place of the
   * resolved absolute filesystem path so the user's home directory
   * never leaves the machine, and reused for telemetry under the same
   * reasoning. May be empty when the agent omitted `cwd`.
   */
  cwdPrefix: string;
  agentExplanation: string;
  shellTail: string;
}

/**
 * Classifies whether a shell command should require user approval when the
 * agent is in `smart` mode.
 *
 * Never throws: on total classifier failure, returns a fail-closed result
 * that defers to manual approval.
 */
export async function classifyShellCommand(
  params: ClassifyShellCommandInput,
  modelProviderService: Pick<ModelProviderService, 'getModelWithOptions'>,
  agentInstanceId: string,
  telemetry: TelemetryService,
): Promise<SmartApprovalResult> {
  const start = Date.now();
  const cwdPrefix = derivePrefix(params.cwdPrefix);
  const userMessage = buildUserMessage(params);
  // We intentionally pass `cwdPrefix` (the short mount prefix) to the
  // classifier instead of the resolved absolute path. The classifier only
  // needs to know "inside which workspace" the command runs, not where that
  // workspace lives on disk.

  let lastError: Error | undefined;

  for (
    let attemptIdx = 0;
    attemptIdx < SMART_APPROVAL_MODELS.length;
    attemptIdx++
  ) {
    const modelId = SMART_APPROVAL_MODELS[attemptIdx];
    try {
      const modelWithOptions = modelProviderService.getModelWithOptions(
        modelId,
        agentInstanceId,
        {
          $ai_span_name: 'smart-approval-classification',
          $ai_parent_id: agentInstanceId,
        },
      );

      const abortController = new AbortController();
      const timeout = setTimeout(
        () => abortController.abort(),
        SMART_APPROVAL_TIMEOUT_MS,
      );

      try {
        const { object } = await generateObject({
          model: modelWithOptions.model,
          providerOptions: deepMergeProviderOptions(
            modelWithOptions.providerOptions,
            { anthropic: { thinking: { type: 'disabled' } } },
          ),
          headers: modelWithOptions.headers,
          abortSignal: abortController.signal,
          schema: smartApprovalSchema,
          messages: [
            { role: 'system', content: SMART_APPROVAL_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
        });

        telemetry.capture('smart-approval-classified', {
          needs_approval: object.needsApproval,
          latency_ms: Date.now() - start,
          model_id: modelId,
          fallback_index: attemptIdx,
          cwd_prefix: cwdPrefix,
        });

        return object;
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      lastError = e as Error;
      // Continue to next fallback
    }
  }

  // All models failed — fail closed.
  telemetry.capture('smart-approval-classified', {
    needs_approval: true,
    latency_ms: Date.now() - start,
    model_id: 'failed',
    fallback_index: SMART_APPROVAL_MODELS.length,
    cwd_prefix: cwdPrefix,
    error: lastError?.message?.slice(0, 200),
  });

  return {
    needsApproval: true,
    explanation: 'Classifier unavailable. Approving manually to stay safe.',
  };
}

/**
 * Serialize the classifier inputs as JSON. JSON is used instead of
 * ad-hoc XML-style tags because `shellTail` can contain arbitrary output
 * (e.g. `cat some.xml`) that would otherwise close a tag and confuse the
 * classifier. `JSON.stringify` guarantees all embedded characters are
 * escaped.
 */
const buildUserMessage = (params: ClassifyShellCommandInput): string =>
  JSON.stringify(
    {
      command: params.command,
      cwd: params.cwdPrefix,
      agent_explanation: params.agentExplanation,
      shell_tail: params.shellTail || null,
    },
    null,
    2,
  );

/**
 * Extracts the leading mount prefix slug (e.g. `"w1e07"`) from a raw
 * mount path like `"w1e07"` or `"w1e07/apps/browser"`. Used for
 * telemetry so we never leak subpaths into analytics. Returns an empty
 * string when the input does not start with a valid mount-prefix slug.
 */
const derivePrefix = (cwdPrefix: string): string => {
  const match = cwdPrefix.match(/^([a-z0-9]{4,6})(?=\/|$)/i);
  return match ? match[1] : '';
};
