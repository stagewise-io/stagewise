import { Button } from '@/components/ui/button';
import { cn } from '@/utils';
import type {
  ChatMessage,
  TextUIPart,
  FileUIPart,
  DynamicToolUIPart,
  ReasoningUIPart,
} from '@stagewise/karton-contract';
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
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
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import ReactMarkdown from 'react-markdown';

export function ChatBubble({ message: msg }: { message: ChatMessage }) {
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
            'group relative min-h-8 animate-chat-bubble-appear space-y-3 break-words rounded-2xl bg-white/5 px-2.5 py-1.5 font-normal text-sm shadow-lg shadow-zinc-950/10 ring-1 ring-inset last:mb-0.5',
            msg.role === 'assistant'
              ? 'min-w-48 origin-bottom-left rounded-bl-xs bg-zinc-100/60 text-zinc-950 ring-zinc-950/5'
              : 'origin-bottom-right rounded-br-xs bg-blue-600/90 text-white ring-white/5',
          )}
        >
          <div
            className={cn(
              'group-hover:-top-3 -top-2 absolute z-20 w-max rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-950/80 opacity-0 shadow-sm ring-1 ring-zinc-500/10 ring-inset transition-all duration-150 ease-out group-hover:opacity-100',
              msg.role === 'assistant' ? 'left-1' : 'right-1',
            )}
          >
            <TimeAgo date={msg.metadata.createdAt} />
          </div>
          {msg.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return (
                  <TextPartItem
                    key={`content_part_${index.toString()}`}
                    textPart={part}
                  />
                );
              case 'reasoning':
                return (
                  <ReasoningPartItem
                    key={`content_part_${index.toString()}`}
                    reasoningPart={part}
                  />
                );
              case 'file':
                return (
                  <FilePartItem
                    key={`content_part_${index.toString()}`}
                    filePart={part}
                  />
                );
              case 'dynamic-tool':
                return (
                  <ToolPartItem
                    key={`content_part_${index.toString()}`}
                    toolPart={part}
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

const TextPartItem = memo(({ textPart }: { textPart: TextUIPart }) => {
  return (
    <div className="markdown">
      <ReactMarkdown>{textPart.text}</ReactMarkdown>
    </div>
  );
});

const ReasoningPartItem = memo(
  ({ reasoningPart }: { reasoningPart: ReasoningUIPart }) => {
    return (
      <div className="-mx-1 block min-w-32 rounded-xl border-border/20 bg-zinc-500/5 px-2 py-0.5">
        <Disclosure>
          <DisclosureButton className="group flex w-full flex-row items-center justify-between gap-2 text-black/60 hover:text-black/90">
            <BrainIcon className="size-3" />
            <span className="block flex-1 text-start text-xs">Thinking...</span>
            <ChevronDownIcon
              className={
                'size-3 transition-all duration-150 ease-out group-hover:stroke-black group-data-open:rotate-180'
              }
            />
          </DisclosureButton>
          <DisclosurePanel className="markdown pt-1.5 pb-0.5 pl-1 opacity-80">
            <ReactMarkdown>{reasoningPart.text}</ReactMarkdown>
          </DisclosurePanel>
        </Disclosure>
      </div>
    );
  },
);

const FilePartItem = memo(({ filePart }: { filePart: FileUIPart }) => {
  if (filePart.type.startsWith('image/')) {
    return (
      <a href={filePart.url} target="_blank" rel="noopener noreferrer">
        <img
          src={filePart.url}
          alt={filePart.filename ?? 'Generated file'}
          className="h-auto max-w-full rounded-lg"
        />
      </a>
    );
  }
  return (
    <div
      role="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-black/5 p-2 hover:bg-black/10"
      onClick={() => {
        window.open(filePart.url, '_blank');
      }}
    >
      <FileIcon className="size-4" />
      <span className="text-xs">{filePart.filename ?? 'Generated file'}</span>
    </div>
  );
});

const ToolPartItem = memo(({ toolPart }: { toolPart: DynamicToolUIPart }) => {
  const { approveToolCall, rejectToolCall, toolCallApprovalRequests } =
    useKarton((s) => ({
      approveToolCall: s.serverProcedures.approveToolCall,
      rejectToolCall: s.serverProcedures.rejectToolCall,
      toolCallApprovalRequests: s.state.toolCallApprovalRequests,
    }));

  const requiresApproval = useMemo(
    () =>
      toolCallApprovalRequests.includes(toolPart.toolCallId) &&
      (toolPart.state === 'output-available' ||
        toolPart.state === 'output-error'),
    [toolCallApprovalRequests, toolPart.toolCallId, toolPart.state],
  );

  return (
    <div className="-mx-1 flex flex-col gap-2 rounded-xl bg-zinc-500/5 px-2 py-0.5">
      <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60">
        {getToolIcon(toolPart.toolName)}
        <div className="flex flex-1 flex-col items-start gap-0">
          <span className="text-black/80 text-xs">
            {getToolName(toolPart.toolName)}
          </span>
          {toolPart.state === 'output-error' && (
            <span className="text-rose-600 text-xs">{toolPart.errorText}</span>
          )}
          {requiresApproval && (
            <span className="text-black/50 text-xs italic">
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
                rejectToolCall(toolPart.toolCallId);
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
                approveToolCall(toolPart.toolCallId);
              }}
            >
              <CheckIcon className="size-4" />
            </Button>
          </div>
        )}
        {toolPart.state === 'output-available' && (
          <CheckIcon className="size-3 text-green-600" />
        )}
        {toolPart.state === 'output-error' && (
          <XIcon className="size-3 text-rose-600" />
        )}
        {(toolPart.state === 'input-streaming' ||
          toolPart.state === 'input-available') &&
          !requiresApproval && (
            <CogIcon className="size-3 animate-spin text-blue-600" />
          )}
      </div>
    </div>
  );
});

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'readFileTool':
    case 'listFilesTool':
      return <EyeIcon className="size-3" />;
    case 'grepSearchTool':
    case 'globTool':
      return <SearchIcon className="size-3" />;
    case 'overwriteFileTool':
    case 'multiEditTool':
      return <PencilIcon className="size-3" />;
    case 'deleteFileTool':
      return <TrashIcon className="size-3" />;
    default:
      return <CogIcon className="size-3" />;
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
