import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { isPlanPath } from '@shared/plan-ownership';
import { isLogPath } from '@shared/log-ownership';
import { PlanCheckoffToolPart } from './plan-checkoff';
import { LogEditToolPart } from './log-edit';
import { GenericMultiEditToolPart } from './generic-multi-edit';

export type MultiEditPart = Extract<
  AgentToolUIPart,
  { type: 'tool-multiEdit' }
>;

/** Regex that matches a checkbox line. */
const CHECKBOX_LINE_RE = /^(\s*- \[)([ xX])(\] .+)$/;

/**
 * Returns `true` when every edit in the array is a pure checkbox
 * toggle (`- [ ]` ↔ `- [x]`), i.e. nothing else in the line changed
 * except the checkbox state character.
 *
 * Handles both single-line and multi-line edits (agents sometimes
 * batch several checkbox toggles into one edit entry).
 */
function isPureCheckboxToggle(
  edits: Array<{ old_string?: string; new_string?: string } | undefined>,
): boolean {
  if (edits.length === 0) return false;

  for (const edit of edits) {
    if (!edit) return false;
    const oldLines = (edit.old_string ?? '').split('\n');
    const newLines = (edit.new_string ?? '').split('\n');

    // Line counts must match
    if (oldLines.length !== newLines.length) return false;

    let hasToggle = false;

    for (let i = 0; i < oldLines.length; i++) {
      const oldLine = oldLines[i]!;
      const newLine = newLines[i]!;

      // Empty / whitespace-only lines are fine (context around checkboxes)
      if (oldLine.trim() === '' && newLine.trim() === '') continue;

      // Identical non-checkbox lines are fine (headings, etc. as context)
      if (oldLine === newLine) continue;

      const oldMatch = CHECKBOX_LINE_RE.exec(oldLine);
      const newMatch = CHECKBOX_LINE_RE.exec(newLine);
      if (!oldMatch || !newMatch) return false;

      // Everything except the checkbox char must be identical
      if (oldMatch[1] !== newMatch[1] || oldMatch[3] !== newMatch[3])
        return false;

      // The checkbox state must actually differ
      if (oldMatch[2]!.toLowerCase() === newMatch[2]!.toLowerCase())
        return false;

      hasToggle = true;
    }

    // At least one line must be an actual toggle
    if (!hasToggle) return false;
  }

  return true;
}

export const MultiEditToolPart = ({ part }: { part: MultiEditPart }) => {
  const relativePath = part.input?.path ?? '';

  // Route to compact log-edit UI for log channel files
  if (isLogPath(relativePath)) {
    return <LogEditToolPart part={part} />;
  }

  // Route to compact plan-checkoff UI when:
  // 1. The file is a plan
  // 2. All edits are pure checkbox toggles (or still streaming)
  const isStreaming =
    part.state === 'input-streaming' || part.state === 'input-available';
  const edits = part.input?.edits;
  const isPlan = isPlanPath(relativePath);
  const isCheckboxOnly =
    isPlan &&
    (isStreaming || (Array.isArray(edits) && isPureCheckboxToggle(edits)));

  if (isCheckboxOnly) {
    return <PlanCheckoffToolPart part={part} />;
  }

  return <GenericMultiEditToolPart part={part} />;
};
