import type {
  UIMessagePart,
  ReasoningUIPart,
  UIDataTypes,
  DynamicToolUIPart,
} from 'ai';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { isReadOnlyToolPart } from './message-part-ui/tools/exploring';

export function isToolPart(
  part: UIMessagePart<UIDataTypes, UIAgentTools>,
): part is AgentToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function isToolOrReasoningPart(
  part: UIMessagePart<UIDataTypes, UIAgentTools>,
): part is AgentToolUIPart | ReasoningUIPart {
  return (
    part.type === 'dynamic-tool' ||
    part.type.startsWith('tool-') ||
    part.type === 'reasoning'
  );
}

/**
 * Check if an assistant message is "empty" (no visible content yet).
 * Used to determine if we should show the "Working..." indicator.
 */
export function isEmptyAssistantMessage(msg: AgentMessage): boolean {
  // If it has any tools or files, it's not empty
  if (
    msg.parts
      .map((part) => part.type)
      .some(
        (type) =>
          type === 'dynamic-tool' ||
          type.startsWith('tool-') ||
          type === 'file',
      )
  )
    return false;

  // Check if all text/reasoning parts are empty
  return msg.parts.every(
    (part) =>
      (part.type !== 'text' && part.type !== 'reasoning') ||
      ((part.type === 'text' || part.type === 'reasoning') &&
        part.text.trim() === ''),
  );
}

function isPartSettled(
  part: UIMessagePart<UIDataTypes, UIAgentTools>,
): boolean {
  if (part.type === 'text' || part.type === 'reasoning')
    return part.state === 'done' || part.state === undefined;

  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    const state = (part as AgentToolUIPart | DynamicToolUIPart).state;
    return state === 'output-available' || state === 'output-error';
  }

  return true;
}

/**
 * Check if all parts in a message have reached a terminal state
 * AND the indicator would not be redundant. Returns false when:
 * - Any part is still streaming/executing
 * - The last visible part is text/reasoning (brief gap before
 *   isWorking flips false — no indicator needed)
 * - The trailing parts form a multi-part exploring group (2+
 *   consecutive read-only tools) whose wrapper already shimmers
 */
export function areAllPartsSettled(msg: AgentMessage): boolean {
  if (!msg.parts.every(isPartSettled)) return false;

  // Find the last non-step-start part to check its type
  let lastVisiblePart: UIMessagePart<UIDataTypes, UIAgentTools> | undefined;
  for (let i = msg.parts.length - 1; i >= 0; i--) {
    if (msg.parts[i]?.type !== 'step-start') {
      lastVisiblePart = msg.parts[i];
      break;
    }
  }
  if (!lastVisiblePart) return false;

  // Don't show after text/reasoning — the gap before isWorking
  // flips false is too brief and causes a flash.
  if (lastVisiblePart.type === 'text' || lastVisiblePart.type === 'reasoning')
    return false;

  // Don't show when trailing parts form an exploring group (any
  // consecutive read-only tools/reasoning) — the ExploringToolParts
  // wrapper already provides its own shimmer in that case.
  let trailingReadOnlyCount = 0;
  for (let i = msg.parts.length - 1; i >= 0; i--) {
    const part = msg.parts[i];
    if (!part || part.type === 'step-start') continue;
    if (
      isToolOrReasoningPart(part) &&
      isReadOnlyToolPart(part as AgentToolUIPart | ReasoningUIPart)
    ) {
      trailingReadOnlyCount++;
    } else break;
  }
  if (trailingReadOnlyCount >= 1) return false;

  return true;
}
