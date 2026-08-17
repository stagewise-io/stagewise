import { IconCheck2Outline18, IconGear2Outline18 } from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { cn } from '@ui/utils';
import type { DynamicToolUIPart } from 'ai';
import { ToolPartUI } from './shared/tool-part-ui';

type PlanStep = { step: string; status: string };
type ExternalToolInput = {
  title?: string;
  kind?: string;
  locations?: string[];
  plan?: PlanStep[];
};

export function ExternalAgentToolPart({
  part,
  shimmer,
}: {
  part: DynamicToolUIPart;
  shimmer: boolean;
}) {
  const [openAgentId] = useOpenAgent();
  const sendApproval = useKartonProcedure(
    (procedures) => procedures.agents.sendToolApprovalResponse,
  );
  const isApproval = part.state === 'approval-requested';
  const isError = part.state === 'output-error';
  const isDenied = part.state === 'output-denied';
  const isFinished = part.state.startsWith('output-');
  const toolName = part.toolName.slice(part.toolName.indexOf('.') + 1);
  const input = (part.input as ExternalToolInput | undefined) ?? {};
  const output = 'output' in part ? part.output : undefined;
  const errorText = 'errorText' in part ? part.errorText : undefined;
  const plan = toolName === 'plan' ? (input.plan ?? []) : [];
  const locations = input.locations ?? [];
  const resultText =
    errorText ??
    (typeof output === 'string'
      ? output
      : (output as { text?: string } | undefined)?.text);
  const planCompleted =
    plan.length > 0 && plan.every((step) => step.status === 'completed');
  const label = isApproval
    ? `${toolName} needs approval`
    : isError
      ? `Failed ${toolName}`
      : isDenied
        ? `Denied ${toolName}`
        : plan.length
          ? `${planCompleted ? 'Completed' : 'Running'} plan`
          : input.kind === 'edit' && locations.length > 0
            ? `${isFinished ? 'Changed' : 'Changing'} ${locations.length} ${
                locations.length === 1 ? 'file' : 'files'
              }`
            : `${isFinished ? 'Finished' : 'Running'} ${toolName}`;
  const respond = (approved: boolean) => {
    if (!openAgentId || !isApproval || !part.approval?.id) return;
    sendApproval(
      openAgentId,
      part.approval.id,
      approved,
      approved ? undefined : 'User denied',
    );
  };

  return (
    <ToolPartUI
      showBorder={isApproval}
      isShimmering={shimmer && !isFinished}
      trigger={
        <div className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
          <IconGear2Outline18 className="size-3 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      }
      content={
        plan.length && !isError && !isDenied ? (
          <div className="space-y-1 px-2.5 py-2 text-xs">
            {plan.map((step) => (
              <div key={step.step} className="flex items-start gap-1.5">
                {step.status === 'completed' ? (
                  <IconCheck2Outline18 className="mt-0.5 size-3 shrink-0 text-success-foreground" />
                ) : (
                  <span
                    className={cn(
                      'mt-1 size-2 shrink-0 rounded-full border',
                      step.status === 'inProgress'
                        ? 'border-primary bg-primary'
                        : 'border-derived',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'text-foreground',
                    step.status === 'completed' &&
                      'text-subtle-foreground line-through',
                  )}
                >
                  {step.step}
                </span>
              </div>
            ))}
          </div>
        ) : locations.length > 0 && !isError && !isDenied ? (
          <div className="space-y-1 px-2.5 py-2 text-xs">
            {locations.map((location) => (
              <div
                key={location}
                className="truncate font-mono text-muted-foreground"
              >
                {location}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1 px-2.5 py-2 text-xs">
            {input.title ? (
              <div className="text-foreground">{input.title}</div>
            ) : null}
            {resultText ? (
              <pre
                className={cn(
                  'max-h-48 overflow-auto whitespace-pre-wrap font-mono text-2xs',
                  isError ? 'text-error-foreground' : 'text-muted-foreground',
                )}
              >
                {resultText}
              </pre>
            ) : null}
          </div>
        )
      }
      contentFooterStatic
      contentFooterClassName="justify-end border-derived border-t"
      contentFooter={
        isApproval ? (
          <>
            <Button variant="ghost" size="xs" onClick={() => respond(false)}>
              Deny
            </Button>
            <Button variant="primary" size="xs" onClick={() => respond(true)}>
              Allow
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
