import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { resolveAttachmentBlobUrl } from '@ui/components/attachment-renderers';
import { formatImageGenerationSettings } from '@ui/components/image-model-options';
import { AttachmentFileClickWrapper } from '@ui/components/streamdown/attachment-links';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { ImageIcon } from 'lucide-react';
import { ToolPartUI } from './shared/tool-part-ui';

export function GenerateImageToolPart({
  part,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-generateImage' }>;
}) {
  const [agentId] = useOpenAgent();
  if (part.state === 'output-available') {
    const settingsSummary = formatImageGenerationSettings(
      part.output.effectiveSettings,
    );
    return (
      <div className="my-2 flex w-fit max-w-full flex-col items-start gap-2 rounded-xl border border-derived-subtle bg-background p-2 shadow-elevation-1 dark:bg-surface-1">
        <div className="flex items-center gap-1 px-1 text-muted-foreground text-xs">
          <ImageIcon className="size-3 shrink-0" />
          <span>Generated with {part.output.modelId}</span>
        </div>
        {part.input.prompt ? (
          <div className="max-w-2xl whitespace-pre-wrap break-words px-1 text-muted-foreground text-xs">
            {part.input.prompt}
          </div>
        ) : null}
        {part.output.attachments.map((attachment) => (
          <AttachmentFileClickWrapper
            key={attachment.path}
            attachmentId={attachment.path.slice('att/'.length)}
            displayName={attachment.originalFileName}
            className="block max-w-full"
          >
            <img
              src={resolveAttachmentBlobUrl(attachment.path, agentId)}
              alt={attachment.originalFileName}
              className="block h-auto max-h-80 w-auto max-w-full rounded-lg object-contain"
            />
          </AttachmentFileClickWrapper>
        ))}
        {settingsSummary ? (
          <div className="px-1 text-[10px] text-subtle-foreground">
            {settingsSummary}
          </div>
        ) : null}
      </div>
    );
  }

  const streaming =
    part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <ToolPartUI
      isShimmering={streaming}
      hideChevron
      trigger={
        <>
          <ImageIcon className="size-3 shrink-0" />
          <span className="truncate text-xs">
            {streaming
              ? 'Generating image…'
              : part.state === 'output-error'
                ? (part.errorText ?? 'Image generation failed')
                : 'Generated image'}
          </span>
        </>
      }
    />
  );
}
