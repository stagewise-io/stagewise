import type {
  ToolPart,
  UIMessagePart,
  ReasoningUIPart,
  ChatMessage,
} from '@shared/karton-contracts/ui';

export function isToolPart(part: UIMessagePart): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function isToolOrReasoningPart(
  part: UIMessagePart,
): part is ToolPart | ReasoningUIPart {
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
export function isEmptyAssistantMessage(msg: ChatMessage): boolean {
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
