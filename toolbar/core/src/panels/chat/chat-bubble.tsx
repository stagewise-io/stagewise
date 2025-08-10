import { Button } from '@/components/ui/button';
import { cn, getDataUriForData } from '@/utils';
import type {
  ChatMessage,
  ToolCallPart,
  ToolResultPart,
  FilePart,
  ImagePart,
} from '@stagewise/karton-contract';
import {
  CheckIcon,
  CogIcon,
  EyeIcon,
  FileIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import TimeAgo from 'react-timeago';
import { useKarton } from '@/hooks/use-karton';

export function ChatBubble({
  message: msg,
  toolResultParts,
}: {
  message: ChatMessage;
  toolResultParts: ToolResultPart[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 items-center justify-start gap-2',
          msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse',
        )}
      >
        <div
          className={cn(
            'group relative flex min-h-8 items-center space-y-2 rounded-2xl bg-white/5 px-2.5 py-1 font-normal text-sm shadow-lg shadow-zinc-950/10 ring-1 ring-inset',
            msg.role === 'assistant'
              ? 'rounded-bl-xs bg-zinc-100/60 text-zinc-950 ring-zinc-950/5'
              : 'rounded-br-xs bg-blue-600/90 text-white ring-white/5',
          )}
        >
          <div
            className={cn(
              'group-hover:-top-3 -top-2 absolute z-20 w-max rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-950/80 opacity-0 shadow-sm ring-1 ring-zinc-500/10 ring-inset transition-all duration-150 ease-out group-hover:opacity-100',
              msg.role === 'assistant' ? 'left-1' : 'right-1',
            )}
          >
            <TimeAgo date={msg.createdAt} />
          </div>
          {(Array.isArray(msg.content)
            ? msg.content
            : [{ type: 'text', text: msg.content }]
          ).map((part, index) => {
            switch (part.type) {
              case 'text':
                return (
                  <p
                    key={`content_part_${index.toString()}`}
                    className="whitespace-pre-wrap"
                  >
                    {part.text}
                  </p>
                );
              case 'file':
              case 'image':
                return (
                  <FilePartItem
                    key={`content_part_${index.toString()}`}
                    file={part}
                  />
                );
              case 'tool-call':
                return (
                  <ToolCallPartItem
                    key={`content_part_${index.toString()}`}
                    toolCall={part}
                    toolResultParts={toolResultParts}
                  />
                );
              default:
                return null;
            }
          })}
        </div>

        <div className="min-w-12 grow" />
      </div>
    </div>
  );
}

const FilePartItem = memo(({ file }: { file: FilePart }) => {
  const dataUri = useMemo(
    () =>
      /*(file.data instanceof URL ? file.data : getDataUriForData(file.data))*/
      '', // Add, support back in once types are fixed
    [file.data],
  );

  if (file.type.startsWith('image/')) {
    return null; // TODO Add support back in once types are fixed
    /*
    return (
      <a href={dataUri} target="_blank" rel="noopener noreferrer">
        <img
          src={dataUri}
          alt={file.filename ?? 'Generated file'}
          className="h-auto max-w-full rounded-lg"
        />
      </a>
    );
    */
  }
  return (
    <div
      role="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-black/5 p-2 hover:bg-black/10"
      onClick={() => {
        window.open(dataUri, '_blank');
      }}
    >
      <FileIcon className="size-4" />
      <span className="text-xs">{file.filename ?? 'Generated file'}</span>
    </div>
  );
});

const ToolCallPartItem = memo(
  ({
    toolCall,
    toolResultParts,
  }: {
    toolCall: ToolCallPart;
    toolResultParts: ToolResultPart[];
  }) => {
    const { approveToolCall, rejectToolCall, toolCallApprovalRequests } =
      useKarton((s) => ({
        approveToolCall: s.serverProcedures.approveToolCall,
        rejectToolCall: s.serverProcedures.rejectToolCall,
        toolCallApprovalRequests: s.state.toolCallApprovalRequests,
      }));

    const requiresApproval = useMemo(
      () => toolCallApprovalRequests.includes(toolCall.toolCallId),
      [toolCallApprovalRequests, toolCall.toolCallId],
    );

    const toolResultPart = useMemo(
      () =>
        toolResultParts.find((part) => part.toolCallId === toolCall.toolCallId),
      [toolResultParts, toolCall.toolCallId],
    );

    return (
      <div className="flex flex-call gap-2 rounded-xl bg-black/5 p-2 hover:bg-black/10">
        <div className="flex w-full flex-row items-center justify-between gap-3 stroke-black/80">
          {getToolIcon(toolCall.toolName)}
          <div className="flex flex-col items-start gap-0">
            <span className="font-medium text-xs">
              {getToolName(toolCall.toolName)}
            </span>
            {requiresApproval && (
              <span className="text-black/60 text-xs">
                Waiting for approval
              </span>
            )}
          </div>
          {requiresApproval && (
            <div className="flex flex-row items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-4 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  rejectToolCall(toolCall.toolCallId);
                }}
              >
                <XIcon className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-4 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  approveToolCall(toolCall.toolCallId);
                }}
              >
                <CheckIcon className="size-4" />
              </Button>
            </div>
          )}
          {toolResultPart &&
            (toolResultPart.isError ? (
              <XIcon className="size-3 text-rose-600" />
            ) : (
              <CheckIcon className="size-3 text-green-600" />
            ))}
          {!toolResultPart && !requiresApproval && (
            <CogIcon className="size-3 animate-spin text-blue-600" />
          )}
        </div>
      </div>
    );
  },
);

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'readFileTool':
    case 'listFilesTool':
      return <EyeIcon className="size-4" />;
    case 'grepSearchTool':
    case 'globTool':
      return <SearchIcon className="size-4" />;
    case 'overwriteFileTool':
    case 'multiEditTool':
      return <PencilIcon className="size-4" />;
    case 'deleteFileTool':
      return <TrashIcon className="size-4" />;
    default:
      return <CogIcon className="size-4" />;
  }
};

const getToolName = (toolName: string) => {
  switch (toolName) {
    case 'readFileTool':
      return 'Reading Files';
    case 'listFilesTool':
      return 'Listing Files';
    case 'grepSearchTool':
      return 'Searching with Grep';
    case 'globTool':
      return 'Searching with Glob';
    case 'overwriteFileTool':
    case 'multiEditTool':
      return 'Editing Files';
    case 'deleteFileTool':
      return 'Deleting Files';
    default:
      return toolName;
  }
};
