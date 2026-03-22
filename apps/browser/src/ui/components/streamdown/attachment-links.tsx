import {
  useMemo,
  useCallback,
  useState,
  useRef,
  Suspense,
  type ReactNode,
} from 'react';

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
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { FileContextMenu } from '@ui/components/file-context-menu';
import {
  useAttachmentMetadata,
  type AttachmentMetadata,
} from '@ui/hooks/use-attachment-metadata';
import { MessageAttachmentsProvider } from '@ui/hooks/use-message-elements';
import { ElementAttachmentView } from '@ui/screens/main/sidebar/chat/_components/rich-text/attachments';
import { MentionNodeView } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions';
import { TabMentionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/tab-mention-badge';
import { WorkspaceMentionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/workspace-mention-badge';
import { BadgeContainer } from '@ui/screens/main/sidebar/chat/_components/rich-text/shared';
import { MentionIcon } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/mention-icon';
import {
  getRenderer,
  resolveAttachmentBlobUrl,
  type RendererProps,
} from '@ui/components/attachment-renderers';
import { inferMimeType } from '@shared/mime-utils';
import { getBaseName } from '@shared/path-utils';
import type { SelectedElement } from '@shared/selected-elements';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the workspace display name for a mount-prefixed file path.
 * Returns the folder name of the mount (e.g. "stagewise") or null if
 * the mount cannot be found.
 */
function useWorkspaceName(filePath: string): string | null {
  const historicalMounts = useMountedPaths();
  const [openAgentId] = useOpenAgent();
  const liveMounts = useKartonState((s) =>
    openAgentId ? (s.toolbox[openAgentId]?.workspace?.mounts ?? null) : null,
  );

  return useMemo(() => {
    const slashIdx = filePath.indexOf('/');
    if (slashIdx <= 0) return null;
    const prefix = filePath.slice(0, slashIdx);
    const mounts =
      (historicalMounts?.length ? historicalMounts : null) ?? liveMounts ?? [];
    const mount = mounts.find((m) => m.prefix === prefix);
    if (!mount) return null;
    return getBaseName(mount.path) || mount.path;
  }, [filePath, historicalMounts, liveMounts]);
}

/**
 * Builds a JS-truncated display label for a workspace file badge.
 * Tries to keep parent directory context while ensuring the filename
 * (including extension) is never clipped.
 */
function useFileBadgeLabel(strippedPath: string, lineNumber?: string): string {
  return useMemo(() => {
    // Try 3 segments first, fall back to fewer if too long for the badge.
    let truncated = getTruncatedFileUrl(strippedPath, 3, 128);
    if (truncated.length > 30) {
      truncated = getTruncatedFileUrl(strippedPath, 2, 128);
    }
    if (truncated.length > 30) {
      truncated = getTruncatedFileUrl(strippedPath, 1, 128);
    }
    // If the filename alone is still too long, mid-truncate preserving ext.
    if (truncated.length > 30) {
      const dotIdx = truncated.lastIndexOf('.');
      const base = dotIdx > 0 ? truncated.substring(0, dotIdx) : truncated;
      const ext = dotIdx > 0 ? truncated.substring(dotIdx) : '';
      const keep = 30 - ext.length - 1;
      truncated =
        keep > 0 ? `${base.substring(0, keep)}\u2026${ext}` : `\u2026${ext}`;
    }
    if (lineNumber) return `${truncated}:${lineNumber}`;
    return truncated || '...';
  }, [strippedPath, lineNumber]);
}

// ─── Color badge ─────────────────────────────────────────────────────────────

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

// ─── Link parsing ────────────────────────────────────────────────────────────

/**
 * Parsed attachment link data - discriminated union for type safety.
 */
export type AttachmentLinkData =
  | { type: 'element'; id: string }
  | { type: 'att'; id: string; params: Record<string, string> }
  | { type: 'color'; color: string }
  | {
      type: 'wsfile';
      filePath: string;
      lineNumber?: string;
      incomplete?: boolean;
      /** Query params after the path (e.g. `?display=expanded`) */
      params?: Record<string, string>;
    }
  | { type: 'tab'; id: string }
  | { type: 'workspace'; prefix: string }
  | { type: 'mention'; providerType: string; id: string; label?: string };

/**
 * Parses a `path:` unified link into AttachmentLinkData.
 *
 * Semantics:
 *   path:att/<id>[?params]   → att attachment
 *   path:<mountPrefix>/...   → wsfile (file inside a workspace mount)
 *   path:<mountPrefix>       → workspace (mount root, no slash after prefix)
 *
 * Mount prefixes are non-empty strings that do NOT contain slashes.
 */
function parsePathLink(rest: string): AttachmentLinkData | null {
  // att/ prefix → file attachment (never incomplete, always fully known)
  if (rest.startsWith('att/')) {
    const attRest = rest.slice('att/'.length);
    const qIdx = attRest.indexOf('?');
    const id = qIdx >= 0 ? attRest.slice(0, qIdx) : attRest;
    const params: Record<string, string> = {};
    if (qIdx >= 0) {
      for (const pair of attRest.slice(qIdx + 1).split('&')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx >= 0) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        else params[pair] = 'true';
      }
    }
    return { type: 'att', id, params };
  }

  // incomplete: marker emitted by the streaming pre-processor
  // (only ever for workspace-file paths, never for att/ links)
  const incomplete = rest.startsWith('incomplete:');
  const path = incomplete ? rest.slice('incomplete:'.length) : rest;

  const slashIdx = path.indexOf('/');
  if (slashIdx <= 0) {
    // No slash → workspace-only link (just mount prefix)
    if (!path) return null;
    return { type: 'workspace', prefix: path };
  }

  // Has slash → workspace file link — strip query params first
  const qIdx = path.indexOf('?');
  const rawPath = qIdx >= 0 ? path.slice(0, qIdx) : path;
  const params: Record<string, string> = {};
  if (qIdx >= 0) {
    for (const pair of path.slice(qIdx + 1).split('&')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx >= 0) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      else params[pair] = 'true';
    }
  }
  const decoded = decodeURIComponent(rawPath);
  const colonIndex = decoded.lastIndexOf(':');
  const hasLineNumber =
    colonIndex > 0 && /^\d+$/.test(decoded.slice(colonIndex + 1));
  const rawFilePath = hasLineNumber ? decoded.slice(0, colonIndex) : decoded;
  const lineNumber = hasLineNumber ? decoded.slice(colonIndex + 1) : undefined;
  return {
    type: 'wsfile',
    filePath: rawFilePath,
    lineNumber,
    incomplete,
    params: Object.keys(params).length > 0 ? params : undefined,
  };
}

const ATTACHMENT_LINK_PATTERNS: Array<{
  prefix: string;
  parse: (rest: string) => AttachmentLinkData | null;
}> = [
  // ── Canonical unified protocol ──────────────────────────────────────────
  {
    prefix: 'path:',
    parse: parsePathLink,
  },
  // ── Legacy protocols (kept as read-time aliases) ─────────────────────────
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
      const raw = incomplete ? rest.slice('incomplete:'.length) : rest;
      // Strip query params
      const qIdx = raw.indexOf('?');
      const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
      const params: Record<string, string> = {};
      if (qIdx >= 0) {
        for (const pair of raw.slice(qIdx + 1).split('&')) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx >= 0) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          else params[pair] = 'true';
        }
      }
      const colonIndex = pathPart.lastIndexOf(':');
      const hasLineNumber =
        colonIndex > 0 && /^\d+$/.test(pathPart.slice(colonIndex + 1));
      const rawFilePath = hasLineNumber
        ? pathPart.slice(0, colonIndex)
        : pathPart;
      const filePath = decodeURIComponent(rawFilePath);
      const lineNumber = hasLineNumber
        ? pathPart.slice(colonIndex + 1)
        : undefined;
      return {
        type: 'wsfile',
        filePath,
        lineNumber,
        incomplete,
        params: Object.keys(params).length > 0 ? params : undefined,
      };
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

/**
 * All protocol prefixes recognised by the attachment link parser.
 * Used by streaming pre-processors to detect incomplete links.
 */
export const ATTACHMENT_LINK_PREFIXES: readonly string[] = [
  'path:',
  'element:',
  'att:',
  'color:',
  'tab:',
  'workspace:',
  'mention:',
  'wsfile:',
];

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
      return `element-${linkData.id}`;
    case 'att':
      return `att-${linkData.id}`;
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

// ─── Workspace file wrapper (IDE click, tooltip, context menu) ───────────────

/**
 * Wraps any workspace-file badge with IDE-opening click behaviour, context
 * menu, and tooltip (workspace name + path + IDE hint).
 *
 * Shared by both `WorkspaceFileLink` (non-media files) and
 * `PathFileRendererLink` (images/PDFs) so the IDE-opening UX is identical.
 */
const WorkspaceFileClickWrapper = ({
  filePath,
  lineNumber,
  incomplete,
  children,
}: {
  filePath: string;
  lineNumber?: string;
  incomplete?: boolean;
  children: ReactNode;
}) => {
  const [openAgent] = useOpenAgent();
  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);
  const ideName = IDE_SELECTION_ITEMS[openInIdeChoice];
  const { getFileIDEHref, needsIdePicker, pickIdeAndOpen, resolvePath } =
    useFileIDEHref();
  const wsName = useWorkspaceName(filePath);

  const strippedPath = stripMountPrefix(filePath);
  const displayPathWithLine = lineNumber
    ? `${strippedPath}:${lineNumber}`
    : strippedPath;
  const pathWithLine = lineNumber ? `${filePath}:${lineNumber}` : filePath;

  const parsedLineNumber = lineNumber
    ? Number.parseInt(lineNumber, 10)
    : undefined;

  const processedHref = useMemo(() => {
    if (!openAgent) return '';
    let href = getFileIDEHref(pathWithLine);
    href = href.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      openAgent,
    );
    return href;
  }, [pathWithLine, getFileIDEHref, openAgent]);

  const handleClick = useCallback(() => {
    if (needsIdePicker) return;
    if (processedHref) window.open(processedHref, '_blank');
  }, [needsIdePicker, processedHref]);

  const wrapped = (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('inline cursor-pointer', incomplete && 'opacity-70')}
            onClick={handleClick}
            role="link"
            aria-label={`Open ${displayPathWithLine} in ${ideName}`}
          >
            {children}
          </span>
        }
      />
      <TooltipContent>
        <div className="flex max-w-96 flex-col gap-1">
          {wsName && <div className="font-semibold text-xs">{wsName}</div>}
          <div className="break-all font-mono text-xs">
            {displayPathWithLine}
          </div>
          <div className="text-muted-foreground text-xs">
            Click to open in {ideName}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
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
          {wrapped}
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
      {wrapped}
    </FileContextMenu>
  );
};

// ─── Non-media workspace file badge ──────────────────────────────────────────

interface WorkspaceFileLinkProps {
  filePath: string;
  lineNumber?: string;
  incomplete?: boolean;
}

/**
 * Badge for non-media workspace files (`.ts`, `.json`, etc.).
 * Renders a file-icon badge with a JS-truncated path label.
 * IDE-opening, tooltip, and context menu are handled by
 * `WorkspaceFileClickWrapper`.
 */
export const WorkspaceFileLink = ({
  filePath,
  lineNumber,
  incomplete,
}: WorkspaceFileLinkProps) => {
  const strippedPath = stripMountPrefix(filePath);
  const displayLabel = useFileBadgeLabel(strippedPath, lineNumber);

  return (
    <WorkspaceFileClickWrapper
      filePath={filePath}
      lineNumber={lineNumber}
      incomplete={incomplete}
    >
      <span className="inline shrink-0 px-0.5 pt-px">
        <BadgeContainer className="cursor-pointer">
          <span className="text-foreground" aria-hidden>
            <MentionIcon providerType="file" id={filePath} />
          </span>
          <span
            className="whitespace-nowrap font-medium text-xs leading-none"
            aria-hidden
          >
            {displayLabel}
          </span>
        </BadgeContainer>
      </span>
    </WorkspaceFileClickWrapper>
  );
};

// ─── Element badges ─────────────────────────────────────────────────────────

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

// ─── Unified file renderer (att/ + workspace paths) ──────────────────────────

/**
 * Unified file renderer for both attachment (`att/<filename>`) and workspace
 * (`<mountPrefix>/<relativePath>`) file paths.
 *
 * Both are just paths with real file extensions — MIME type is inferred from
 * the filename. The only difference is the URL scheme used to load the blob:
 *   - `att/<name>`         → `attachment://<agentId>/<name>`
 *   - `<mount>/<relPath>`  → `workspace://<mount>/<relPath>`
 *
 * When `params.display === 'expanded'` and the renderer has an Expanded
 * variant (image/*, video/*), renders the full preview; otherwise renders
 * the compact inline badge.
 *
 * Workspace paths are automatically wrapped with `WorkspaceFileClickWrapper`
 * for IDE-opening behaviour.
 */
const PathFileRendererLink = ({
  path,
  params,
}: {
  /** Full path including mount/att prefix, e.g. `att/shot.png` or `w1/src/logo.svg` */
  path: string;
  params: Record<string, string>;
}) => {
  const [openAgent] = useOpenAgent();
  const attachments = useAttachmentMetadata();

  const isAtt = path.startsWith('att/');
  const fileName = getBaseName(path) || path;
  const mediaType = inferMimeType(fileName);

  const blobUrl = useMemo(
    () => resolveAttachmentBlobUrl(path, openAgent),
    [path, openAgent],
  );

  // For att/ paths, look up originalFileName from attachment metadata for
  // human-readable badge display. For workspace paths the basename is used;
  // truncateLabel (in BadgeShell) handles length capping.
  const id = isAtt ? path.slice('att/'.length) : path;
  const metadata = attachments[path];
  const displayFileName =
    metadata && 'originalFileName' in metadata && metadata.originalFileName
      ? metadata.originalFileName
      : fileName;
  // sizeBytes is only present on sandbox-produced attachments (tool outputs).
  const sizeBytes =
    metadata && 'sizeBytes' in metadata ? (metadata.sizeBytes as number) : 0;

  const renderer = getRenderer(mediaType);
  const isExpanded = params.display === 'expanded';
  const rendererProps: RendererProps = {
    attachmentId: id,
    mediaType,
    blobUrl,
    params,
    fileName: displayFileName,
    sizeBytes,
  };

  let content: ReactNode;
  if (isExpanded && renderer.Expanded) {
    content = (
      <Suspense fallback={<renderer.Badge {...rendererProps} viewOnly />}>
        <renderer.Expanded {...rendererProps} />
      </Suspense>
    );
  } else {
    content = <renderer.Badge {...rendererProps} viewOnly />;
  }

  // Workspace files get IDE-opening click + context menu + tooltip.
  if (!isAtt) {
    return (
      <WorkspaceFileClickWrapper filePath={path}>
        {content}
      </WorkspaceFileClickWrapper>
    );
  }

  return content;
};

// ─── Router ──────────────────────────────────────────────────────────────────

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
        <PathFileRendererLink
          path={`att/${linkData.id}`}
          params={linkData.params}
        />
      );

    case 'wsfile': {
      const wsParams = linkData.params ?? {};
      const wsMime = inferMimeType(getBaseName(linkData.filePath));
      const isPreviewable =
        wsMime.startsWith('image/') || wsMime === 'application/pdf';
      // Previewable files (images, PDFs) use PathFileRendererLink so they
      // get the same thumbnail badge + hover preview as user-attached files.
      // PathFileRendererLink already resolves workspace:// URLs.
      if (isPreviewable && !linkData.incomplete) {
        return (
          <PathFileRendererLink path={linkData.filePath} params={wsParams} />
        );
      }
      return (
        <WorkspaceFileLink
          filePath={linkData.filePath}
          lineNumber={linkData.lineNumber}
          incomplete={linkData.incomplete}
        />
      );
    }
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
