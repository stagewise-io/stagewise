import {
  useMemo,
  useCallback,
  useState,
  useRef,
  Suspense,
  type ReactNode,
} from 'react';

import { cn, IDE_SELECTION_ITEMS, stripMountPrefix } from '@ui/utils';
import { getFolderIDEUrl } from '@shared/ide-url';
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
import { useAttachmentMetadata } from '@ui/hooks/use-attachment-metadata';

import { TabMentionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/tab-mention-badge';
import { ShellSessionBadge } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/shell-session-badge';
import {
  getRenderer,
  resolveAttachmentBlobUrl,
  type RendererProps,
} from '@ui/components/attachment-renderers';
import { inferMimeType } from '@shared/mime-utils';
import { getBaseName } from '@shared/path-utils';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';
import { FileReferenceBadge } from '@ui/components/file-reference-badge';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the workspace display name for a mount-prefixed file path.
 * Used by `WorkspaceFileClickWrapper` for the tooltip.
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
  | { type: 'color'; color: string }
  | {
      type: 'path';
      filePath: string;
      lineNumber?: string;
      incomplete?: boolean;
      /** Query params after the path (e.g. `?display=expanded`) */
      params?: Record<string, string>;
    }
  | { type: 'tab'; id: string }
  | { type: 'shell'; sessionId: string };

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
  // incomplete: marker emitted by the streaming pre-processor
  // (only ever for workspace-file paths, never for att/ links)
  const incomplete = rest.startsWith('incomplete:');
  const path = incomplete ? rest.slice('incomplete:'.length) : rest;

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
    type: 'path',
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
  // ── Other canonical protocols ───────────────────────────────────────────
  {
    prefix: 'color:',
    parse: (rest) => ({ type: 'color', color: decodeURIComponent(rest) }),
  },
  { prefix: 'tab:', parse: (rest) => ({ type: 'tab', id: rest }) },
  {
    prefix: 'shell:',
    parse: (rest) => {
      const sessionId = rest.trim();
      if (!sessionId) return null;
      return { type: 'shell', sessionId };
    },
  },

  // ── Legacy protocols (read-time aliases) ─────────────────────────────────
  { prefix: 'att:', parse: (rest) => parsePathLink(`att/${rest}`) },
  { prefix: 'workspace:', parse: parsePathLink },
  { prefix: 'wsfile:', parse: parsePathLink },
  {
    prefix: 'mention:',
    parse: (rest) => {
      // Legacy mention:providerType:path — strip the providerType prefix.
      const colonIdx = rest.indexOf(':');
      return parsePathLink(colonIdx > 0 ? rest.slice(colonIdx + 1) : rest);
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
    case 'path':
      return `path-${linkData.filePath}`;
    case 'color':
      return `color-${linkData.color}`;
    case 'tab':
      return `tab-${linkData.id}`;
    case 'shell':
      return `shell-${linkData.sessionId}`;
  }
}

// ─── Workspace file wrapper (IDE click, tooltip, context menu) ───────────────

/**
 * Wraps any workspace-file badge with IDE-opening click behaviour, context
 * menu, and tooltip (workspace name + path + IDE hint).
 *
 * Shared by `FileReferenceBadge` (non-media files) and
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

  const isFolder =
    filePath.endsWith('/') || !filePath.includes('/') /* workspace root */;

  const processedHref = useMemo(() => {
    if (!openAgent) return '';

    if (isFolder) {
      const absPath = resolvePath(filePath);
      if (!absPath) return '#';
      return getFolderIDEUrl(absPath, openInIdeChoice);
    }

    let href = getFileIDEHref(pathWithLine);
    href = href.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      openAgent,
    );
    return href;
  }, [
    pathWithLine,
    getFileIDEHref,
    openAgent,
    isFolder,
    resolvePath,
    filePath,
    openInIdeChoice,
  ]);

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
          onSelect={(ide) => {
            if (isFolder) {
              const absPath = resolvePath(filePath);
              if (absPath) {
                window.open(getFolderIDEUrl(absPath, ide), '_blank');
              }
            } else {
              pickIdeAndOpen(ide, pathWithLine, parsedLineNumber);
            }
          }}
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
  const rawFileName = getBaseName(path) || path;

  // Resolve displayFileName BEFORE MIME inference so att/ blob keys
  // (e.g. "a3f2-b1c4") are resolved to the real filename for correct
  // MIME routing (e.g. "screenshot.png" → image/png).
  const metadata = attachments[path];
  const displayFileName =
    metadata && 'originalFileName' in metadata && metadata.originalFileName
      ? metadata.originalFileName
      : rawFileName;

  const mediaType = inferMimeType(displayFileName);

  const blobUrl = useMemo(
    () => resolveAttachmentBlobUrl(path, openAgent),
    [path, openAgent],
  );

  const id = isAtt ? path.slice('att/'.length) : path;
  // sizeBytes is only present on sandbox-produced attachments (tool outputs).
  const sizeBytes =
    metadata && 'sizeBytes' in metadata ? (metadata.sizeBytes as number) : 0;

  const renderer = getRenderer(mediaType);
  const isFallback = renderer.id === 'fallback';
  const isExpanded = params.display === 'expanded';

  // For non-media files (fallback renderer), use the unified
  // FileReferenceBadge which shows seti-based type-aware icons for files
  // and folder/git-branch icons for directories and workspace roots.
  if (isFallback && !isExpanded) {
    const badge = (
      <FileReferenceBadge
        filePath={path}
        displayFileName={isAtt ? displayFileName : undefined}
        bare
        className="cursor-pointer"
      />
    );
    if (!isAtt) {
      return (
        <WorkspaceFileClickWrapper filePath={path}>
          {badge}
        </WorkspaceFileClickWrapper>
      );
    }
    return badge;
  }

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
  switch (linkData.type) {
    case 'path':
      return (
        <PathFileRendererLink
          path={linkData.filePath}
          params={linkData.params ?? {}}
        />
      );
    case 'color':
      return <ColorBadge color={linkData.color} />;
    case 'tab':
      return <TabMentionBadge tabId={linkData.id} />;
    case 'shell':
      return <ShellSessionBadge sessionId={linkData.sessionId} />;
  }
};
