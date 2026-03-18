import { useMemo, useState, useRef, Suspense, type ReactNode } from 'react';
import {
  cn,
  IDE_SELECTION_ITEMS,
  getTruncatedFileUrl,
  stripMountPrefix,
} from '@ui/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonState } from '@ui/hooks/use-karton';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { usePostHog } from 'posthog-js/react';
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { FileContextMenu } from '@ui/components/file-context-menu';
import {
  useAttachmentMetadata,
  type AttachmentMetadata,
} from '@ui/hooks/use-attachment-metadata';
import { MessageAttachmentsProvider } from '@ui/hooks/use-message-elements';
import {
  ElementAttachmentView,
  TextClipAttachmentView,
} from '@ui/screens/main/sidebar/chat/_components/rich-text/attachments';
import { MentionNodeView } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions';
import { TabMentionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/tab-mention-badge';
import { WorkspaceMentionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/workspace-mention-badge';
import {
  getRenderer,
  type RendererProps,
} from '@ui/components/attachment-renderers';
import type { SelectedElement } from '@shared/selected-elements';

interface ColorBadgeProps {
  color: string;
  children?: ReactNode;
}

export const ColorBadge = ({ color, children }: ColorBadgeProps) => {
  const [hasCopied, setHasCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const ignoreCloseRef = useRef(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(color);
    setHasCopied(true);
    setTooltipOpen(true);
    ignoreCloseRef.current = true;
    setTimeout(() => {
      ignoreCloseRef.current = false;
    }, 50);
    setTimeout(() => {
      setHasCopied(false);
    }, 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && ignoreCloseRef.current) return;
    setTooltipOpen(open);
  };

  return (
    <Tooltip open={tooltipOpen} onOpenChange={handleOpenChange}>
      <TooltipTrigger>
        <span
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard();
          }}
          className={cn(
            'group/inline-color rounded bg-surface-1 px-1.5 py-0.5 font-mono text-foreground text-xs',
            'inline-flex cursor-pointer items-center hover:bg-hover-derived hover:text-hover-derived active:bg-active-derived active:text-active-derived',
          )}
        >
          <span
            className="mr-1 inline-block size-3 shrink-0 rounded-sm border border-derived align-middle group-hover/inline-color:border-derived-strong! group-hover/inline-color:bg-hover-derived! group-active/inline-color:border-derived-strong! group-active/inline-color:bg-active-derived!"
            style={
              {
                backgroundColor: color,
                '--cm-bg-color': color,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
          {children ?? color}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hasCopied ? 'Copied' : 'Copy'}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Parsed attachment link data - discriminated union for type safety.
 */
export type AttachmentLinkData =
  | { type: 'element'; id: string }
  | { type: 'att'; id: string; params: Record<string, string> }
  | { type: 'textClip'; id: string }
  | { type: 'color'; color: string }
  | {
      type: 'wsfile';
      filePath: string;
      lineNumber?: string;
      incomplete?: boolean;
    }
  | { type: 'tab'; id: string }
  | { type: 'workspace'; prefix: string }
  | { type: 'mention'; providerType: string; id: string; label?: string };

const ATTACHMENT_LINK_PATTERNS: Array<{
  prefix: string;
  parse: (rest: string) => AttachmentLinkData;
}> = [
  { prefix: 'element:', parse: (rest) => ({ type: 'element', id: rest }) },
  {
    prefix: 'att:',
    parse: (rest) => {
      const qIdx = rest.indexOf('?');
      const id = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
      const params: Record<string, string> = {};
      if (qIdx >= 0) {
        for (const pair of rest.slice(qIdx + 1).split('&')) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx >= 0) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          else params[pair] = 'true';
        }
      }
      return { type: 'att', id, params };
    },
  },
  { prefix: 'text-clip:', parse: (rest) => ({ type: 'textClip', id: rest }) },
  {
    prefix: 'color:',
    parse: (rest) => ({ type: 'color', color: decodeURIComponent(rest) }),
  },
  {
    prefix: 'tab:',
    parse: (rest) => ({ type: 'tab', id: rest }),
  },
  {
    prefix: 'workspace:',
    parse: (rest) => ({ type: 'workspace', prefix: rest }),
  },
  {
    prefix: 'mention:',
    parse: (rest) => {
      const colonIdx = rest.indexOf(':');
      if (colonIdx < 0)
        return { type: 'mention', providerType: 'file', id: rest };
      return {
        type: 'mention',
        providerType: rest.slice(0, colonIdx),
        id: rest.slice(colonIdx + 1),
      };
    },
  },
  {
    prefix: 'wsfile:',
    parse: (rest) => {
      const incomplete = rest.startsWith('incomplete:');
      const path = incomplete ? rest.slice('incomplete:'.length) : rest;
      const colonIndex = path.lastIndexOf(':');
      const hasLineNumber =
        colonIndex > 0 && /^\d+$/.test(path.slice(colonIndex + 1));
      const rawFilePath = hasLineNumber ? path.slice(0, colonIndex) : path;
      const filePath = decodeURIComponent(rawFilePath);
      const lineNumber = hasLineNumber ? path.slice(colonIndex + 1) : undefined;
      return { type: 'wsfile', filePath, lineNumber, incomplete };
    },
  },
];

export function parseAttachmentLink(
  href: string | undefined,
): AttachmentLinkData | null {
  if (!href) return null;

  for (const { prefix, parse } of ATTACHMENT_LINK_PATTERNS) {
    if (href.startsWith(prefix)) {
      return parse(href.slice(prefix.length));
    }
  }
  return null;
}

export type MessageSegment =
  | { kind: 'text'; content: string }
  | { kind: 'attachment'; linkData: AttachmentLinkData };

export function parseMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const linkStartRegex = /\[([^\]]*)\]\(/g;
  const prefixes = ATTACHMENT_LINK_PATTERNS.map((p) => p.prefix);
  let lastEnd = 0;
  let match = linkStartRegex.exec(text);

  while (match !== null) {
    const hrefStart = match.index + match[0].length;
    const rest = text.slice(hrefStart);

    if (!prefixes.some((p) => rest.startsWith(p))) {
      match = linkStartRegex.exec(text);
      continue;
    }

    let depth = 1;
    let i = 0;
    for (; i < rest.length; i++) {
      if (rest[i] === '(') depth++;
      if (rest[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      match = linkStartRegex.exec(text);
      continue;
    }

    const href = rest.slice(0, i);
    const parsed = parseAttachmentLink(href);
    if (!parsed) {
      match = linkStartRegex.exec(text);
      continue;
    }

    const bracketLabel = match[1];
    if (parsed.type === 'mention' && bracketLabel) {
      parsed.label = bracketLabel;
    }

    if (match.index > lastEnd) {
      segments.push({
        kind: 'text',
        content: text.slice(lastEnd, match.index),
      });
    }
    segments.push({ kind: 'attachment', linkData: parsed });
    lastEnd = hrefStart + i + 1;
    match = linkStartRegex.exec(text);
  }

  if (lastEnd < text.length)
    segments.push({ kind: 'text', content: text.slice(lastEnd) });

  return segments;
}

export function getAttachmentKey(linkData: AttachmentLinkData): string {
  switch (linkData.type) {
    case 'element':
    case 'att':
    case 'textClip':
      return `${linkData.type}-${linkData.id}`;
    case 'wsfile':
      return `wsfile-${linkData.filePath}`;
    case 'color':
      return `color-${linkData.color}`;
    case 'tab':
      return `tab-${linkData.id}`;
    case 'workspace':
      return `workspace-${linkData.prefix}`;
    case 'mention':
      return `mention-${linkData.providerType}-${linkData.id}`;
  }
}

interface WorkspaceFileLinkProps {
  filePath: string;
  lineNumber?: string;
  incomplete?: boolean;
}

export const WorkspaceFileLink = ({
  filePath,
  lineNumber,
  incomplete,
}: WorkspaceFileLinkProps) => {
  const _posthog = usePostHog();
  const [openAgent] = useOpenAgent();
  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);
  const ideName = IDE_SELECTION_ITEMS[openInIdeChoice];
  const { getFileIDEHref, needsIdePicker, pickIdeAndOpen, resolvePath } =
    useFileIDEHref();

  const strippedPath = stripMountPrefix(filePath);

  const displayPath = useMemo(() => {
    return getTruncatedFileUrl(strippedPath, 3, 128);
  }, [strippedPath]);

  const displayPathWithLine = lineNumber
    ? `${strippedPath}:${lineNumber}`
    : strippedPath;
  const pathWithLine = lineNumber ? `${filePath}:${lineNumber}` : filePath;

  const processedHref = useMemo(() => {
    if (!openAgent) return '';
    let href = getFileIDEHref(pathWithLine);
    href = href.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      openAgent,
    );
    return href;
  }, [pathWithLine, getFileIDEHref, openAgent]);

  const parsedLineNumber = lineNumber
    ? Number.parseInt(lineNumber, 10)
    : undefined;

  const anchor = (
    <a
      href={needsIdePicker ? '#' : processedHref}
      className={cn(
        'inline-flex items-center gap-0.5',
        'font-medium text-primary-foreground text-sm',
        'hover:text-hover-derived',
        'break-all',
        incomplete && 'opacity-70',
      )}
      target={needsIdePicker ? undefined : '_blank'}
      rel="noopener noreferrer"
      onClick={needsIdePicker ? (e) => e.preventDefault() : undefined}
    >
      {displayPath || '...'}
      {lineNumber && <span className="shrink-0 opacity-70">:{lineNumber}</span>}
    </a>
  );

  if (needsIdePicker) {
    return (
      <FileContextMenu
        relativePath={filePath}
        resolvePath={resolvePath}
        lineNumber={parsedLineNumber}
      >
        <IdePickerPopover
          onSelect={(ide) =>
            pickIdeAndOpen(ide, pathWithLine, parsedLineNumber)
          }
        >
          {anchor}
        </IdePickerPopover>
      </FileContextMenu>
    );
  }

  return (
    <FileContextMenu
      relativePath={filePath}
      resolvePath={resolvePath}
      lineNumber={parsedLineNumber}
    >
      <Tooltip>
        <TooltipTrigger>{anchor}</TooltipTrigger>
        <TooltipContent>
          <div className="flex max-w-96 flex-col gap-1">
            <div className="break-all font-mono text-xs">
              {displayPathWithLine}
            </div>
            <div className="text-muted-foreground text-xs">
              Click to open in {ideName}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </FileContextMenu>
  );
};

interface AttachmentLinkBaseProps {
  id: string;
  metadata: AttachmentMetadata | undefined;
}

const ElementAttachmentLink = ({ id, metadata }: AttachmentLinkBaseProps) => {
  const element: SelectedElement | null =
    metadata && 'tagName' in metadata ? (metadata as SelectedElement) : null;

  const label = useMemo(() => {
    if (!element) return `@${id.slice(0, 8)}`;
    const tagName = element.tagName.toLowerCase();
    const domId = element.attributes?.id ? `#${element.attributes.id}` : '';
    return `${tagName}${domId}`;
  }, [id, element]);

  return (
    <MessageAttachmentsProvider elements={element ? [element] : []}>
      <ElementAttachmentView
        viewOnly
        selected={false}
        node={{ attrs: { id, label } }}
      />
    </MessageAttachmentsProvider>
  );
};

const TextClipAttachmentLink = ({ id, metadata }: AttachmentLinkBaseProps) => {
  const { label, content } = useMemo(() => {
    if (!metadata || !('content' in metadata)) {
      return { label: 'text', content: '' };
    }
    return {
      label: 'label' in metadata ? metadata.label : 'text',
      content: metadata.content,
    };
  }, [metadata]);

  return (
    <TextClipAttachmentView
      viewOnly
      selected={false}
      node={{ attrs: { id, label, content } }}
    />
  );
};

const AttachmentRendererLink = ({
  id,
  params,
}: {
  id: string;
  params: Record<string, string>;
}) => {
  const [openAgent] = useOpenAgent();
  const attachments = useAttachmentMetadata();
  const metadata = attachments[id];
  const mediaType =
    metadata && 'mediaType' in metadata
      ? metadata.mediaType
      : 'application/octet-stream';
  const renderer = getRenderer(mediaType);
  const blobUrl = openAgent ? `attachment://${openAgent}/${id}` : '';
  const isExpanded = params.display === 'expanded';
  const rendererProps: RendererProps = {
    attachmentId: id,
    mediaType,
    blobUrl,
    params,
    fileName: metadata && 'fileName' in metadata ? metadata.fileName : 'file',
    sizeBytes: metadata && 'sizeBytes' in metadata ? metadata.sizeBytes : 0,
  };

  if (isExpanded && renderer.Expanded) {
    return (
      <Suspense fallback={<renderer.Badge {...rendererProps} viewOnly />}>
        <renderer.Expanded {...rendererProps} />
      </Suspense>
    );
  }
  return <renderer.Badge {...rendererProps} viewOnly />;
};

interface AttachmentLinkRouterProps {
  linkData: AttachmentLinkData;
}

export const AttachmentLinkRouter = ({
  linkData,
}: AttachmentLinkRouterProps) => {
  const attachments = useAttachmentMetadata();

  switch (linkData.type) {
    case 'element':
      return (
        <ElementAttachmentLink
          id={linkData.id}
          metadata={attachments[linkData.id]}
        />
      );
    case 'att':
      return (
        <AttachmentRendererLink id={linkData.id} params={linkData.params} />
      );
    case 'textClip':
      return (
        <TextClipAttachmentLink
          id={linkData.id}
          metadata={attachments[linkData.id]}
        />
      );
    case 'wsfile':
      return (
        <WorkspaceFileLink
          filePath={linkData.filePath}
          lineNumber={linkData.lineNumber}
          incomplete={linkData.incomplete}
        />
      );
    case 'color':
      return <ColorBadge color={linkData.color} />;
    case 'tab':
      return <TabMentionBadge tabId={linkData.id} />;
    case 'workspace':
      return <WorkspaceMentionBadge prefix={linkData.prefix} />;
    case 'mention':
      return (
        <MentionNodeView
          viewOnly
          selected={false}
          node={{
            attrs: {
              id: linkData.id,
              label: linkData.label ?? linkData.id,
              providerType: linkData.providerType,
            },
          }}
        />
      );
  }
};
