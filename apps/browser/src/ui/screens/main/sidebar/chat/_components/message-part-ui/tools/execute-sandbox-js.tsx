import { ChevronDownIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconWindowPointerOutline18 } from 'nucleo-ui-outline-18';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';
import { ToolPartUI } from './shared/tool-part-ui';
import { CodeBlock } from '@ui/components/ui/code-block';
import { StreamingCodeBlock } from '@ui/components/ui/streaming-code-block';
import { cn } from '@ui/utils';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';
import { useKartonState } from '@ui/hooks/use-karton';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import type { Attachment } from '@shared/karton-contracts/ui/agent/metadata';
import { inferMimeType } from '@shared/mime-utils';

import { getSandboxLabel } from './utils/sandbox-label-utils';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  getRenderer,
  resolveAttachmentBlobUrl,
  type RendererProps,
} from '@ui/components/attachment-renderers';
import { Suspense } from 'react';
import { ExpandedShell } from '@ui/components/attachment-renderers/shared/expanded-shell';

export const ExecuteSandboxJsToolPart = ({
  part,
  capMaxHeight = false,
  showBorder = false,
  disableShimmer = false,
  isLastPart = false,
  messageAttachments,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-executeSandboxJs' }>;
  capMaxHeight?: boolean;
  showBorder?: boolean;
  disableShimmer?: boolean;
  isLastPart?: boolean;
  /** Attachments from the parent message metadata — populated after the step completes. */
  messageAttachments?: Attachment[];
}) => {
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(true);
  const activeTabs = useKartonState((s) => s.browser.tabs);
  const [openAgentId] = useOpenAgent();

  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const pendingOutputs = useKartonState((s) =>
    openAgentId
      ? s.toolbox[openAgentId]?.pendingSandboxOutputs?.[part.toolCallId]
      : undefined,
  );
  // During streaming: show live pending attachments from Karton state.
  // After completion: use attachments from the parent message metadata.
  const pendingAttachments = useKartonState((s) =>
    openAgentId
      ? s.toolbox[openAgentId]?.pendingSandboxAttachments?.[part.toolCallId]
      : undefined,
  );

  const retainedOutputsRef = useRef<string[] | null>(null);

  if (pendingOutputs && pendingOutputs.length > 0)
    retainedOutputsRef.current = pendingOutputs;

  const finished =
    part.state === 'output-available' || part.state === 'output-error';
  const prevFinishedRef = useRef(finished);
  if (finished && !prevFinishedRef.current) {
    retainedOutputsRef.current = null;
  }
  prevFinishedRef.current = finished;

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  const explanation = part.input?.explanation ?? '';

  // Generate contextual labels based on CDP calls in the script
  const inProgressLabel = useMemo(() => {
    return explanation || getSandboxLabel(part.input?.script, activeTabs, true);
  }, [explanation, part.input?.script, activeTabs]);

  const completedLabel = useMemo(() => {
    return (
      explanation || getSandboxLabel(part.input?.script, activeTabs, false)
    );
  }, [explanation, part.input?.script, activeTabs]);

  // Use the unified auto-expand hook
  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming: streaming,
    isLastPart,
  });

  // Extract first 5 lines of the error for the collapsed preview
  const _errorPreview = useMemo(() => {
    if (!part.errorText) return null;
    return part.errorText.split('\n').slice(0, 5).join('\n');
  }, [part.errorText]);

  // Format the result as pretty-printed JSON if possible
  const formattedResult = useMemo(() => {
    const result = part.output?.result?.result;
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If it's not valid JSON, return as-is
      return result;
    }
  }, [part.output?.result?.result]);

  // Resolved attachments: message metadata (post-step) > live pending (streaming)
  const effectiveAttachments = useMemo(() => {
    if (finished && messageAttachments && messageAttachments.length > 0)
      return messageAttachments;
    if (pendingAttachments && pendingAttachments.length > 0)
      return pendingAttachments as Attachment[];
    return null;
  }, [finished, messageAttachments, pendingAttachments]);

  const effectiveOutputText =
    formattedResult ?? retainedOutputsRef.current?.join('\n') ?? null;
  const hasAnyResult = !!effectiveOutputText || !!effectiveAttachments;

  const resultRef = useRef<HTMLDivElement>(null);
  const liveTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming && liveTextRef.current) {
      liveTextRef.current.scrollTop = liveTextRef.current.scrollHeight;
    }
  }, [streaming, effectiveOutputText]);

  useEffect(() => {
    if (!hasAnyResult || !expanded || !resultRef.current) return;

    let attempts = 0;
    const maxAttempts = 15;
    let frameId: number;

    const findScrollParent = (el: HTMLElement): HTMLElement | null => {
      let node = el.parentElement;
      while (node) {
        if (
          node.hasAttribute('data-overlayscrollbars-viewport') &&
          node.scrollHeight > node.clientHeight
        )
          return node;

        node = node.parentElement;
      }
      return null;
    };

    const tryScroll = () => {
      const el = resultRef.current;
      if (!el) return;

      const scrollParent = findScrollParent(el);
      attempts++;

      if (scrollParent) {
        scrollParent.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -1, bubbles: false }),
        );
        const offset =
          el.getBoundingClientRect().top -
          scrollParent.getBoundingClientRect().top -
          5;
        scrollParent.scrollTop += offset;
        return;
      }

      if (attempts < maxAttempts) frameId = requestAnimationFrame(tryScroll);
    };

    frameId = requestAnimationFrame(tryScroll);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [hasAnyResult, expanded, streaming]);

  if (state === 'error') {
    return (
      <ToolPartUI
        showBorder={showBorder}
        expanded={expanded}
        setExpanded={handleUserSetExpanded}
        trigger={
          <>
            <XIcon className="size-3 shrink-0" />
            <div className="flex min-w-0 flex-col items-start">
              <span className="truncate text-start font-medium text-xs">
                {explanation
                  ? `Error: ${explanation}`
                  : 'Error while running a script'}
              </span>
            </div>
          </>
        }
        content={
          <div className="flex flex-col">
            {part.input?.script && (
              <Collapsible
                open={scriptExpanded}
                onOpenChange={setScriptExpanded}
              >
                <CollapsibleTrigger size="condensed" className="">
                  <ChevronDownIcon
                    className={cn(
                      'size-3 transition-transform duration-150',
                      !scriptExpanded && '-rotate-90',
                    )}
                  />
                  <span className="text-2xs">Script</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="duration-0!">
                  <CodeBlock
                    code={part.input.script}
                    language="javascript"
                    hideActionButtons
                  />
                </CollapsibleContent>
              </Collapsible>
            )}
            {part.errorText && (
              <Collapsible
                open={resultExpanded}
                onOpenChange={setResultExpanded}
              >
                <CollapsibleTrigger size="condensed" className="">
                  <ChevronDownIcon
                    className={cn(
                      'size-3 transition-transform duration-150',
                      !resultExpanded && '-rotate-90',
                    )}
                  />
                  <span className="text-2xs">Error</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="duration-0!">
                  <CodeBlock
                    code={part.errorText}
                    language="javascript"
                    hideActionButtons
                  />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        }
        contentClassName={capMaxHeight ? 'max-h-80!' : undefined}
        contentFooterClassName="px-0"
      />
    );
  }

  return (
    <ToolPartUI
      showBorder={showBorder}
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      isShimmering={!disableShimmer && streaming}
      autoScroll={streaming && !hasAnyResult}
      trigger={
        <>
          {!streaming && (
            <IconWindowPointerOutline18 className="size-3 shrink-0" />
          )}
          <div
            className={cn(
              'flex flex-row items-center justify-start gap-1',
              showBorder && 'flex-1',
            )}
          >
            {streaming ? (
              <LoadingHeader
                disableShimmer={disableShimmer}
                label={inProgressLabel}
              />
            ) : (
              <SuccessHeader
                capMaxHeight={capMaxHeight}
                label={completedLabel}
              />
            )}
          </div>
        </>
      }
      content={
        <>
          {streaming && !hasAnyResult && part.input?.script && (
            <StreamingCodeBlock
              code={part.input.script}
              language="javascript"
            />
          )}
          {hasAnyResult && part.input?.script && (
            <div className="flex flex-col">
              {!streaming && (
                <Collapsible
                  open={scriptExpanded}
                  onOpenChange={setScriptExpanded}
                >
                  <CollapsibleTrigger size="condensed" className="">
                    <ChevronDownIcon
                      className={cn(
                        'size-3 transition-transform duration-150',
                        !scriptExpanded && '-rotate-90',
                      )}
                    />
                    <span className="text-2xs">Script</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="duration-0!">
                    <CodeBlock
                      code={part.input.script}
                      language="javascript"
                      hideActionButtons
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
              <div ref={resultRef}>
                <Collapsible
                  open={resultExpanded}
                  onOpenChange={setResultExpanded}
                >
                  <CollapsibleTrigger size="condensed" className="">
                    <ChevronDownIcon
                      className={cn(
                        'size-3 transition-transform duration-150',
                        !resultExpanded && '-rotate-90',
                      )}
                    />
                    <span className="text-2xs">Result</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="duration-0!">
                    {effectiveAttachments && (
                      <AttachmentPreviewCards
                        attachments={effectiveAttachments}
                      />
                    )}
                    {effectiveOutputText && (
                      <div
                        ref={liveTextRef}
                        className={cn(
                          streaming &&
                            (effectiveAttachments
                              ? 'scrollbar-none max-h-12 overflow-y-auto'
                              : 'scrollbar-none max-h-50.5 overflow-y-auto'),
                        )}
                      >
                        {streaming ? (
                          <StreamingCodeBlock
                            code={effectiveOutputText}
                            language="json"
                          />
                        ) : (
                          <CodeBlock
                            code={effectiveOutputText}
                            language="json"
                            hideActionButtons
                          />
                        )}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}
        </>
      }
      contentClassName={
        capMaxHeight
          ? streaming && !hasAnyResult
            ? 'max-h-32!'
            : 'max-h-80!'
          : undefined
      }
      contentFooterClassName="px-0"
    />
  );
};

const AttachmentPreviewCards = ({
  attachments,
}: {
  attachments: Attachment[];
}) => {
  const [openAgentId] = useOpenAgent();
  return (
    <div className="scrollbar-hover-only flex flex-row gap-2 overflow-x-auto px-1 py-2 [&_embed]:max-h-38 [&_img]:max-h-38 [&_video]:max-h-38">
      {attachments.map((att) => {
        const blobKey = att.path.startsWith('att/')
          ? att.path.slice(4)
          : att.path;
        const displayName =
          att.originalFileName ?? blobKey.split('/').pop() ?? blobKey;
        const mediaType = inferMimeType(displayName);
        const renderer = getRenderer(mediaType);
        const blobUrl = resolveAttachmentBlobUrl(att.path, openAgentId);
        const rendererProps: RendererProps = {
          attachmentId: blobKey,
          mediaType,
          fileName: displayName,
          sizeBytes: 0,
          blobUrl,
          params: {},
        };

        if (renderer.Expanded) {
          return (
            <Suspense
              key={att.path}
              fallback={
                <ExpandedShell fileName={rendererProps.fileName}>
                  <span className="text-muted-foreground text-xs">
                    Loading...
                  </span>
                </ExpandedShell>
              }
            >
              <renderer.Expanded {...rendererProps} />
            </Suspense>
          );
        }

        return <renderer.Badge key={att.path} {...rendererProps} viewOnly />;
      })}
    </div>
  );
};

const SuccessHeader = ({
  capMaxHeight,
  label,
}: {
  capMaxHeight?: boolean;
  label: string;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1">
        <span
          className={cn('shrink-0 text-xs', !capMaxHeight && 'font-normal')}
        >
          {capMaxHeight ? label : <span className="font-medium">{label}</span>}
        </span>
      </div>
    </div>
  );
};

const LoadingHeader = ({
  disableShimmer,
  label,
}: {
  disableShimmer?: boolean;
  label: string;
}) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon
        className={cn(
          'size-3 shrink-0 animate-spin',
          disableShimmer ? '' : 'text-primary-foreground',
        )}
      />
      <span
        dir="ltr"
        className={cn('text-xs', disableShimmer ? '' : 'shimmer-text-primary')}
      >
        {label}
      </span>
    </div>
  );
};
