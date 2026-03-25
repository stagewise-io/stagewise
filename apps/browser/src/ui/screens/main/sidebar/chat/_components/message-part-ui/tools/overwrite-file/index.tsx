import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { isPlanPath } from '@shared/plan-ownership';
import { CreatePlanToolPart } from './create-plan';
import { GenericOverwriteFileToolPart } from './generic-overwrite-file';

export type OverwriteFilePart = Extract<
  AgentToolUIPart,
  { type: 'tool-overwriteFile' }
>;

export const OverwriteFileToolPart = ({
  part,
}: {
  part: OverwriteFilePart;
}) => {
  if (isPlanPath(part.input?.relative_path ?? ''))
    return <CreatePlanToolPart part={part} />;

  return <GenericOverwriteFileToolPart part={part} />;
};
