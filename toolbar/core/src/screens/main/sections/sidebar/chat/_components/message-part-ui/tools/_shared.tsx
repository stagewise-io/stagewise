import type { DynamicToolUIPart, ToolUIPart } from '@stagewise/karton-contract';
import {
  CheckIcon,
  CogIcon,
  InfoIcon,
  XIcon,
  WrenchIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@stagewise/stage-ui/components/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useState, useMemo } from 'react';
import type { ChangeObject } from 'diff';
import { CodeBlock } from '@/components/ui/code-block';
import type { BundledLanguage } from 'shiki';

export function ToolPartUIBase({
  toolIcon,
  toolName,
  toolSubtitle,
  toolDescription,
  part,
  collapsedContent,
  defaultExpanded,
}: {
  toolIcon?: React.ReactNode;
  toolName?: string | React.ReactNode;
  toolSubtitle?: string | React.ReactNode;
  toolDescription?: string;
  part: ToolUIPart | DynamicToolUIPart;
  collapsedContent?: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);

  const toolTitleContent = (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full flex-row items-center gap-1.5">
        {toolIcon ?? <WrenchIcon className="size-3" />}
        <div className="flex flex-col items-start gap-0">
          {toolName && <div className="text-start text-xs">{toolName}</div>}
          {toolSubtitle && (
            <div className="truncate text-start text-muted-foreground text-xs">
              {toolSubtitle}
            </div>
          )}
        </div>
        {toolDescription && (
          <Popover>
            <PopoverTrigger>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-ml-1 size-4 p-0"
              >
                <InfoIcon className="size-3 text-primary" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="px-3 py-1.5 text-sm">
              {toolDescription}
            </PopoverContent>
          </Popover>
        )}
        <div className="flex-1" />
        {(part.state === 'input-available' ||
          part.state === 'input-streaming') && (
          <CogIcon className="size-3 shrink-0 animate-spin text-blue-600" />
        )}
        {part.state === 'output-available' && (
          <CheckIcon className="size-3 shrink-0 text-green-600" />
        )}
        {part.state === 'output-error' && (
          <XIcon className="size-3 shrink-0 text-rose-600" />
        )}
      </div>
      {part.state === 'output-error' && (
        <span className="ml-4.5 text-start font-normal text-rose-600 text-xs">
          {part.errorText}
        </span>
      )}
    </div>
  );

  return (
    <div
      data-state={part.state}
      className="-mx-1 group/item-part block min-w-32 rounded-xl border-border/20 bg-zinc-500/5 font-medium text-foreground"
    >
      {collapsedContent ? (
        <Collapsible
          className="group/collapsible"
          open={isExpanded}
          onOpenChange={setIsExpanded}
        >
          <CollapsibleTrigger
            size="condensed"
            className="h-fit cursor-pointer gap-1 rounded-xl px-2.5 text-foreground"
          >
            {toolTitleContent}
            <ChevronUpIcon
              className={cn(
                'size-3 transition-transform duration-150 group-data-open/collapsible:rotate-180',
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px,black_calc(100%_-_8px),transparent)] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-black/30 block max-h-40 overflow-y-auto overscroll-y-none pt-1.5 pb-0.5 pl-3">
            <div className="pt-2 pb-1 font-normal text-xs">
              {collapsedContent}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="flex w-full flex-col items-center gap-1 rounded-xl px-2.5 py-1">
          {toolTitleContent}
        </div>
      )}
    </div>
  );
}

export function DiffPreview({
  diff,
  filePath,
}: {
  diff: ChangeObject<string>[];
  filePath: string;
}) {
  const diffContent = useMemo(() => {
    return diff.reduce((acc, line) => {
      const newLine = line.added
        ? `+${line.value}`
        : line.removed
          ? `-${line.value}`
          : line.value;
      return `${acc}${newLine}`;
    }, '');
  }, [diff]);

  const fileLanguage = useMemo(() => {
    const filename = filePath.replace(/^.*[\\/]/, '');
    return (
      (filename?.split('.').pop()?.toLowerCase() as BundledLanguage) ?? 'text'
    );
  }, [filePath]);

  return (
    <CodeBlock code={diffContent} language={fileLanguage} hideActionButtons />
  );
}
