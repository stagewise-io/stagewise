import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { isPlanPath } from '@stagewise/agent-core/plans';
import { isLogPath } from '@stagewise/agent-core/logs';
import { CreatePlanToolPart } from './create-plan';
import { CreateLogToolPart } from './create-log';
import { GenericWriteToolPart } from './generic-write';

export type WritePart = Extract<AgentToolUIPart, { type: 'tool-write' }>;

export const WriteToolPart = ({ part }: { part: WritePart }) => {
  if (isPlanPath(part.input?.path ?? ''))
    return <CreatePlanToolPart part={part} />;

  if (isLogPath(part.input?.path ?? ''))
    return <CreateLogToolPart part={part} />;

  return <GenericWriteToolPart part={part} />;
};
