import { NoSuchToolError, type Tool } from 'ai';

/**
 * Shape we actually consume from a zod validation issue. Kept structural so
 * the helper doesn't depend on a specific zod major/minor version.
 */
type StructuralZodIssue = {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
};

/**
 * Format zod issues into a compact, LLM-facing bullet list. Each line is one
 * issue: `- <dot-path>: <message>`. Root-level issues use `(root)`. The list
 * is capped to keep the resulting error message bounded.
 */
function formatZodIssues(issues: readonly StructuralZodIssue[]): string {
  const MAX = 20;
  const lines = issues.slice(0, MAX).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `- ${path}: ${issue.message}`;
  });
  if (issues.length > MAX) {
    lines.push(`- ...${issues.length - MAX} more issues omitted.`);
  }
  return lines.join('\n');
}

export type RepairToolCallArgs = {
  toolCall: { toolName: string; input: string };
  tools: Record<string, Tool>;
  error: unknown;
};

/**
 * Handler passed to `streamText({ experimental_repairToolCall })`.
 *
 * Returns `null` when the error is unrepairable (unknown tool); otherwise
 * throws with a descriptive message so the AI SDK surfaces it to the model
 * as tool-result `errorText`. The thrown error MUST contain enough signal
 * for the model to fix its next call — a generic "schema mismatch" sentence
 * leaves the agent in a retry loop with the same malformed payload.
 */
export async function repairToolCall({
  toolCall,
  tools,
  error,
}: RepairToolCallArgs): Promise<null> {
  // Model hallucinated a tool name — unrepairable.
  if (NoSuchToolError.isInstance(error)) return null;

  const inputLen = toolCall.input?.length ?? 0;
  let parsed: unknown;
  let jsonValid = false;
  try {
    parsed = JSON.parse(toolCall.input);
    jsonValid = true;
  } catch {
    // JSON is unparseable
  }

  if (!jsonValid) {
    // Distinguish empty/tiny input from genuinely truncated long input.
    if (inputLen < 10) {
      throw new Error(
        `Tool call for "${toolCall.toolName}" had empty or near-empty input. The model failed to generate the required parameters.`,
      );
    }
    throw new Error(
      'Tool call inputs were too long and most likely exceeded maximum token output limits. Create more compact tool calls, i.e. by chunking edits into smaller pieces.',
    );
  }

  // JSON is valid — re-validate against the tool's own schema so we can
  // surface the *specific* zod issues. Without this, the model retries
  // against an opaque "schema mismatch" message and loops with the same
  // malformed payload.
  const targetTool = tools?.[toolCall.toolName];
  const schema = targetTool?.inputSchema as
    | { safeParse?: (input: unknown) => unknown }
    | undefined;
  if (schema && typeof schema.safeParse === 'function') {
    const result = schema.safeParse(parsed) as {
      success: boolean;
      error?: { issues: readonly StructuralZodIssue[] };
    };
    if (!result.success && result.error) {
      throw new Error(
        `Schema validation failed for "${toolCall.toolName}":\n${formatZodIssues(
          result.error.issues,
        )}\nReview the tool's parameter requirements and retry with corrected input.`,
      );
    }
  }

  // Schema says the input is valid but AI SDK still flagged it — extremely
  // rare. Fall back to the original generic error.
  throw new Error(
    `Tool call inputs for "${toolCall.toolName}" did not match the expected schema. Check the tool's parameter requirements and try again.`,
  );
}
