import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { isPlanPath } from '@shared/plan-ownership';
import { CreatePlanToolPart } from './create-plan';
import { GenericWriteToolPart } from './generic-write';

export type WritePart = Extract<AgentToolUIPart, { type: 'tool-write' }>;

export const WriteToolPart = ({ part }: { part: WritePart }) => {
  if (isPlanPath(part.input?.path ?? ''))
    return <CreatePlanToolPart part={part} />;

  return <GenericWriteToolPart part={part} />;
};
