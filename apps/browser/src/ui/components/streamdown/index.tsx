import posthog from 'posthog-js';
import { defaultRehypePlugins, Streamdown as StreamdownBase } from 'streamdown';
import { math } from '@streamdown/math';
import 'katex/dist/katex.min.css';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { CodeBlock } from '../ui/code-block';
import { StreamingCodeBlock } from '../ui/streaming-code-block';
import { Mermaid } from '../ui/mermaid';
import {
  memo,
  type DetailedHTMLProps,
  type HTMLAttributes,
  type OlHTMLAttributes,
  type LiHTMLAttributes,
  type ImgHTMLAttributes,
  type BlockquoteHTMLAttributes,
  useState,
  isValidElement,
  type ReactNode,
  useContext,
  createContext,
  useRef,
  useCallback,
  type AnchorHTMLAttributes,
  type InputHTMLAttributes,
  useMemo,
} from 'react';
import { cn } from '@ui/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { CopyCheckIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import type { BundledLanguage } from 'shiki';
import type { ExtraProps } from 'react-markdown';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  MemoTable,
  MemoThead,
  MemoTbody,
  MemoTr,
  MemoTh,
  MemoTd,
} from '../streamdown-tables';
import {
  parseAttachmentLink,
  AttachmentLinkRouter,
  ColorBadge,
} from './attachment-links';
import { resolveLinkAlias } from './link-aliases';

type AttachmentData =
  | {
      type: 'path';
      filePath: string;
      lineNumber?: string;
    }
  | {
      type: 'color';
      color: string;
    };

export function getAttachmentAnchorText(data: AttachmentData): string {
  switch (data.type) {
    case 'path': {
      const link = `${data.filePath}${data.lineNumber ? `:${data.lineNumber}` : ''}`;
      return `[](${link})`;
    }
    case 'color':
      return `[](color:${data.color})`;
  }
}

const LANGUAGE_REGEX = /language-([^\s]+)/;

const getValidCssColor = (children: ReactNode): string | null => {
  const textContent =
    typeof children === 'string'
      ? children
      : Array.isArray(children) && children.every((c) => typeof c === 'string')
        ? children.join('')
        : null;
  if (!textContent || typeof textContent !== 'string') return null;

  const trimmed = textContent.trim();
  if (!trimmed) return null;

  try {
    if (!CSS.supports('color', trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
};

const StreamdownContext = createContext<{
  isStreaming: boolean;
}>({
  isStreaming: false,
});

const StreamdownProvider = ({
  isStreaming,
  children,
}: {
  isStreaming: boolean;
  children: ReactNode;
}) => {
  return (
    <StreamdownContext.Provider value={{ isStreaming }}>
      {children}
    </StreamdownContext.Provider>
  );
};

/**
 * URL-encodes color values in color links to prevent markdown parsing issues.
 * CSS color functions like rgba(0, 0, 0) contain parentheses that conflict
 * with markdown link syntax [text](url). This function finds color links using
 * balanced parentheses detection and URL-encodes the color value.
 *
 * Example: [](color:rgba(0, 0, 0)) -> [](color:rgba%280%2C%200%2C%200%29)
 */
const encodeColorLinksForMarkdown = (markdown: string): string => {
  const colorLinkPattern = /\[([^\]]*)\]\(color:/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null = colorLinkPattern.exec(markdown);

  while (match !== null) {
    const linkTextContent = match[1];
    const colorStartIndex = match.index + match[0].length;

    // Find the end of the color value using balanced parentheses
    let depth = 1; // We're inside the outer ( of [](
    let colorEndIndex = -1;

    for (let i = colorStartIndex; i < markdown.length; i++) {
      const char = markdown[i];
      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth === 0) {
          colorEndIndex = i;
          break;
        }
      }
    }

    if (colorEndIndex === -1) {
      // Unclosed link (probably still streaming), skip encoding this one
      match = colorLinkPattern.exec(markdown);
      continue;
    }

    // Extract and encode the color value
    const colorValue = markdown.slice(colorStartIndex, colorEndIndex);
    const encodedColorValue = encodeURIComponent(colorValue);

    // Build the replacement: everything up to match, then encoded link
    result += markdown.slice(lastIndex, match.index);
    result += `[${linkTextContent}](color:${encodedColorValue})`;
    lastIndex = colorEndIndex + 1;

    // Reset regex lastIndex to continue after this link and get next match
    colorLinkPattern.lastIndex = colorEndIndex + 1;
    match = colorLinkPattern.exec(markdown);
  }

  // Append any remaining content
  result += markdown.slice(lastIndex);
  return result;
};

/**
 * Preprocesses markdown to handle incomplete attachment links during streaming.
 * Converts incomplete markdown like [](path:w1/src/foo without closing ) to valid markdown.
 *
 * Handles all attachment link types: path:, color:, tab:
 *
 * Note: This runs on every render because it's called in JSX. However, once
 * the markdown is complete with a closing ), the regex won't match anymore, so the
 * function efficiently returns the input unchanged.
 */
const preprocessMarkdown = (markdown: string): string => {
  // First, encode color links to handle parentheses in CSS color functions
  let processed = encodeColorLinksForMarkdown(markdown);

  // Detect incomplete attachment links at the end of the string
  // Pattern: [any-text](prefix:... without closing )
  // Supports: path:, color:, tab:
  const incompleteAttachmentLinkRegex =
    /\[([^\]]*)\]\((path|color|tab):([^)]*?)$/;

  processed = processed.replace(
    incompleteAttachmentLinkRegex,
    (_match, linkText, prefix, partialContent) => {
      // For path: links that look like workspace files, add incomplete marker
      if (prefix === 'path') {
        // Only add incomplete marker if this is a file path (has or will have a slash)
        // For att/ and workspace-only forms, close them as-is
        const displayText = linkText || '...';
        return `[${displayText}](path:incomplete:${partialContent})`;
      }
      // For other attachment links, just close them properly
      // The content might be incomplete but the parser will handle partial IDs gracefully
      return `[${linkText}](${prefix}:${partialContent})`;
    },
  );

  return processed;
};

/** Inline markdown wrapper that strips paragraph block margins. */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <span className="inline [&>div]:inline [&_p]:m-0 [&_p]:inline">
      <Streamdown isAnimating={false}>{children}</Streamdown>
    </span>
  );
}

export const Streamdown = ({
  isAnimating,
  children,
}: {
  isAnimating: boolean;
  children: string;
}) => {
  return (
    <StreamdownProvider isStreaming={isAnimating}>
      <StreamdownBase
        animated={{
          animation: 'fadeIn',
          duration: 100,
          easing: 'ease-out',
          sep: 'word',
        }}
        isAnimating={isAnimating}
        mode={isAnimating ? 'streaming' : 'static'}
        shikiTheme={['light-plus', 'dark-plus']}
        controls={{
          code: false,
          mermaid: false,
          table: false,
        }}
        plugins={{
          math,
        }}
        components={{
          code: MemoCode,
          a: MemoAnchor,
          hr: MemoHr,
          p: MemoP,
          blockquote: MemoBlockquote,
          img: MemoImg,
          h1: MemoH1,
          h2: MemoH2,
          h3: MemoH3,
          h4: MemoH4,
          h5: MemoH5,
          h6: MemoH6,
          ul: MemoUl,
          ol: MemoOl,
          li: MemoLi,
          table: MemoTable,
          thead: MemoThead,
          tbody: MemoTbody,
          tr: MemoTr,
          th: MemoTh,
          td: MemoTd,
          input: MemoInput,
        }}
        rehypePlugins={[defaultRehypePlugins.raw!]}
      >
        {preprocessMarkdown(children)}
      </StreamdownBase>
    </StreamdownProvider>
  );
};

const CodeComponent = ({
  node,
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  ExtraProps) => {
  const { isStreaming } = useContext(StreamdownContext);

  const inline = node?.position?.start.line === node?.position?.end.line;

  if (inline)
    return (
      <InlineCodeComponent className={className} {...props}>
        {children}
      </InlineCodeComponent>
    );

  const match = className?.match(LANGUAGE_REGEX);
  const language = (match?.at(1) ?? '') as BundledLanguage;

  // Extract code content from children safely
  let code = '';
  if (
    isValidElement(children) &&
    children.props &&
    typeof children.props === 'object' &&
    'children' in children.props &&
    typeof children.props.children === 'string'
  ) {
    code = children.props.children;
  } else if (typeof children === 'string') {
    code = children;
  }

  return (
    <div
      className={cn(
        'group relative my-2 flex h-auto flex-col gap-1 rounded-lg border border-border-subtle px-2 pt-0.5 pb-2',
        className,
      )}
      data-streamdown={language === 'mermaid' ? 'mermaid-block' : 'code-block'}
    >
      <div className="flex shrink-0 flex-row items-center justify-between">
        <span className="ml-1.5 font-mono font-normal text-muted-foreground text-xs lowercase">
          {language}
        </span>
        {!isStreaming && (
          <div className="flex flex-row items-center justify-end gap-2">
            <CodeBlockCopyButton code={code} />
          </div>
        )}
      </div>
      {language === 'mermaid' ? (
        <OverlayScrollbar
          contentClassName="p-2"
          options={{ overflow: { x: 'scroll', y: 'scroll' } }}
        >
          <Mermaid
            chart={code}
            config={{
              theme: 'default',
            }}
            className="size-max min-h-full min-w-full"
          />
        </OverlayScrollbar>
      ) : isStreaming ? (
        <StreamingCodeBlock
          code={code}
          language={language}
          className="px-1.5"
        />
      ) : (
        <OverlayScrollbar
          data-code-block-container
          data-language={language}
          className="w-full"
          options={{ overflow: { x: 'scroll', y: 'hidden' } }}
        >
          <CodeBlock
            code={code}
            data-language={language}
            data-streamdown="code-block"
            language={language}
            hideActionButtons={false}
          />
        </OverlayScrollbar>
      )}
    </div>
  );
};

const InlineCodeComponent = ({
  children,
  className,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  ExtraProps) => {
  const validColor = getValidCssColor(children);

  // If it's a valid CSS color, render the shared ColorBadge component
  if (validColor) return <ColorBadge color={validColor}>{children}</ColorBadge>;

  return (
    <code
      className={cn(
        'rounded bg-surface-1 px-1.5 py-0.5 font-mono text-foreground text-xs',
        className,
      )}
      data-streamdown="inline-code"
      {...props}
    >
      {children}
    </code>
  );
};

const MemoCode = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & ExtraProps
>(
  CodeComponent,
  (p, n) => p.className === n.className && sameNodePosition(p.node, n.node),
);
MemoCode.displayName = 'MarkdownCode';

function sameNodePosition(prev?: MarkdownNode, next?: MarkdownNode): boolean {
  if (!(prev?.position || next?.position)) {
    return true;
  }
  if (!(prev?.position && next?.position)) {
    return false;
  }

  const prevStart = prev.position.start;
  const nextStart = next.position.start;
  const prevEnd = prev.position.end;
  const nextEnd = next.position.end;

  return (
    prevStart?.line === nextStart?.line &&
    prevStart?.column === nextStart?.column &&
    prevEnd?.line === nextEnd?.line &&
    prevEnd?.column === nextEnd?.column
  );
}

type MarkdownPoint = { line?: number; column?: number };
type MarkdownPosition = { start?: MarkdownPoint; end?: MarkdownPoint };
type MarkdownNode = {
  position?: MarkdownPosition;
  properties?: { className?: string };
};

const CodeBlockCopyButton = ({ code }: { code: string }) => {
  const [hasCopied, setHasCopied] = useState(false);
  const logoResetTimeoutRef = useRef<number | null>(null);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setHasCopied(true);
    if (logoResetTimeoutRef.current) {
      clearTimeout(logoResetTimeoutRef.current);
    }
    logoResetTimeoutRef.current = setTimeout(
      () => setHasCopied(false),
      2000,
    ) as unknown as number;
  };

  return (
    <Button variant="ghost" size="icon-xs" onClick={copyToClipboard}>
      {hasCopied ? (
        <CopyCheckIcon className="size-3" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </Button>
  );
};

const AnchorComponent = ({
  href,
  className,
  children,
  ...props
}: DetailedHTMLProps<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  HTMLAnchorElement
> &
  ExtraProps) => {
  const [openAgent] = useOpenAgent();

  // Parse href for attachment links (path:, color:, tab:)
  const attachmentLink = useMemo(() => parseAttachmentLink(href), [href]);

  // Resolve link aliases (report-agent-issue, socials-discord, etc.)
  const resolvedAlias = useMemo(() => {
    if (!href || !openAgent) return null;
    return resolveLinkAlias(href, {
      agentInstanceId: openAgent,
      appVersion: __APP_VERSION__,
    });
  }, [href, openAgent]);

  // Process regular links (replace conversation ID placeholder)
  // Must be called before conditional return to satisfy React hooks rules
  const processedHref = useMemo(() => {
    if (!href) return '';
    if (!openAgent) return '';
    return href.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      openAgent,
    );
  }, [openAgent, href]);

  // If it's an attachment link, render the appropriate component
  if (attachmentLink) return <AttachmentLinkRouter linkData={attachmentLink} />;

  // If it's a link alias, render as external link with resolved URL
  if (resolvedAlias) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <a
            href={resolvedAlias}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-baseline justify-start gap-0.5 break-all font-medium text-primary-foreground hover:text-hover-derived',
              className,
            )}
            {...props}
          >
            {children}
          </a>
        </TooltipTrigger>
        <TooltipContent>{decodeURI(resolvedAlias)}</TooltipContent>
      </Tooltip>
    );
  }

  // Regular external link rendering
  return (
    <Tooltip>
      <TooltipTrigger>
        <a
          href={processedHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-baseline justify-start gap-0.5 break-all font-medium text-primary-foreground hover:text-hover-derived',
            className,
          )}
          {...props}
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent>{decodeURI(processedHref)}</TooltipContent>
    </Tooltip>
  );
};

const MemoAnchor = memo<
  DetailedHTMLProps<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  > &
    ExtraProps
>(
  AnchorComponent,
  (p, n) =>
    p.href === n.href &&
    p.className === n.className &&
    p.children === n.children,
);
MemoAnchor.displayName = 'MarkdownAnchor';

const HrComponent = ({
  className,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHRElement>, HTMLHRElement> &
  ExtraProps) => {
  return (
    <hr
      className={cn('mx-auto my-6 w-15/16 border-border-subtle', className)}
      data-streamdown="horizontal-rule"
      {...props}
    />
  );
};

// Paragraph component for proper spacing
const PComponent = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<
  HTMLAttributes<HTMLParagraphElement>,
  HTMLParagraphElement
> &
  ExtraProps) => {
  return (
    <p className={cn('my-2', className)} data-streamdown="paragraph" {...props}>
      {children}
    </p>
  );
};

// Blockquote component for quoted text
const BlockquoteComponent = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<
  BlockquoteHTMLAttributes<HTMLQuoteElement>,
  HTMLQuoteElement
> &
  ExtraProps) => {
  return (
    <blockquote
      className={cn(
        'my-2 border-border-subtle border-l-2 pl-2 font-normal text-muted-foreground italic',
        className,
      )}
      data-streamdown="blockquote"
      {...props}
    >
      {children}
    </blockquote>
  );
};

// Image component for responsive images with download button
const ImgComponent = ({
  className,
  alt,
  src,
  ...props
}: DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> &
  ExtraProps) => {
  const downloadImage = useCallback(async () => {
    if (!src) return;

    try {
      // Fetch the image as a blob
      const response = await fetch(src);
      const blob = await response.blob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from src or use default
      const filename = src.split('/').pop()?.split('?')[0] || 'image.png';
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download image:', err);
      posthog.captureException(
        err instanceof Error ? err : new Error(String(err)),
        { source: 'renderer', operation: 'downloadImage' },
      );
    }
  }, [src]);

  return (
    <div className="my-2 flex flex-col gap-1" data-streamdown="image-wrapper">
      {/* Download control */}
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={downloadImage}
          title="Download image"
        >
          <DownloadIcon className="size-3" />
        </Button>
      </div>

      {/* Image */}
      <img
        className={cn('max-w-full rounded-lg', className)}
        alt={alt ?? ''}
        src={src}
        data-streamdown="image"
        {...props}
      />
    </div>
  );
};

// Custom heading components for compact chat rendering
const H1Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h1
      className={cn('mt-3 mb-2 font-semibold text-lg', className)}
      data-streamdown="heading-1"
      {...props}
    >
      {children}
    </h1>
  );
};

const H2Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h2
      className={cn('mt-3 mb-2 font-semibold text-base', className)}
      data-streamdown="heading-2"
      {...props}
    >
      {children}
    </h2>
  );
};

const H3Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h3
      className={cn('mt-2 mb-1.5 font-semibold text-[15px]', className)}
      data-streamdown="heading-3"
      {...props}
    >
      {children}
    </h3>
  );
};

const H4Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h4
      className={cn('mt-2 mb-1.5 font-semibold text-sm', className)}
      data-streamdown="heading-4"
      {...props}
    >
      {children}
    </h4>
  );
};

const H5Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h5
      className={cn('mt-2 mb-1.5 font-semibold text-[13px]', className)}
      data-streamdown="heading-5"
      {...props}
    >
      {children}
    </h5>
  );
};

const H6Component = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
  ExtraProps) => {
  return (
    <h6
      className={cn('mt-2 mb-1.5 font-semibold text-xs', className)}
      data-streamdown="heading-6"
      {...props}
    >
      {children}
    </h6>
  );
};

// Custom list components for compact chat rendering
const UlComponent = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLUListElement>, HTMLUListElement> &
  ExtraProps) => {
  return (
    <ul
      className={cn('my-2 ml-4 list-disc space-y-1', className)}
      data-streamdown="unordered-list"
      {...props}
    >
      {children}
    </ul>
  );
};

const OlComponent = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<OlHTMLAttributes<HTMLOListElement>, HTMLOListElement> &
  ExtraProps) => {
  return (
    <ol
      className={cn('my-2 ml-4 list-decimal space-y-1', className)}
      data-streamdown="ordered-list"
      {...props}
    >
      {children}
    </ol>
  );
};

const LiComponent = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<LiHTMLAttributes<HTMLLIElement>, HTMLLIElement> &
  ExtraProps) => {
  const isTaskItem = className?.includes('task-list-item');
  return (
    <li
      className={cn(
        'pl-1',
        isTaskItem && 'flex list-none items-center gap-1.5',
        className,
      )}
      data-streamdown="list-item"
      {...props}
    >
      {children}
    </li>
  );
};

const InputComponent = ({
  type,
  checked,
  ...props
}: DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> &
  ExtraProps) => {
  if (type === 'checkbox')
    return <Checkbox checked={!!checked} size="2xs" disabled />;

  return <input type={type} checked={checked} {...props} />;
};

const MemoHr = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHRElement>, HTMLHRElement> & ExtraProps
>(HrComponent, (p, n) => p.className === n.className);
MemoHr.displayName = 'MarkdownHr';

const MemoP = memo<
  DetailedHTMLProps<
    HTMLAttributes<HTMLParagraphElement>,
    HTMLParagraphElement
  > &
    ExtraProps
>(
  PComponent,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoP.displayName = 'MarkdownP';

const MemoBlockquote = memo<
  DetailedHTMLProps<
    BlockquoteHTMLAttributes<HTMLQuoteElement>,
    HTMLQuoteElement
  > &
    ExtraProps
>(
  BlockquoteComponent,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoBlockquote.displayName = 'MarkdownBlockquote';

const MemoImg = memo<
  DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> &
    ExtraProps
>(
  ImgComponent,
  (p, n) => p.src === n.src && p.alt === n.alt && p.className === n.className,
);
MemoImg.displayName = 'MarkdownImg';

const MemoH1 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H1Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH1.displayName = 'MarkdownH1';

const MemoH2 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H2Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH2.displayName = 'MarkdownH2';

const MemoH3 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H3Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH3.displayName = 'MarkdownH3';

const MemoH4 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H4Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH4.displayName = 'MarkdownH4';

const MemoH5 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H5Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH5.displayName = 'MarkdownH5';

const MemoH6 = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> &
    ExtraProps
>(
  H6Component,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoH6.displayName = 'MarkdownH6';

const MemoUl = memo<
  DetailedHTMLProps<HTMLAttributes<HTMLUListElement>, HTMLUListElement> &
    ExtraProps
>(
  UlComponent,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoUl.displayName = 'MarkdownUl';

const MemoOl = memo<
  DetailedHTMLProps<OlHTMLAttributes<HTMLOListElement>, HTMLOListElement> &
    ExtraProps
>(
  OlComponent,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoOl.displayName = 'MarkdownOl';

const MemoLi = memo<
  DetailedHTMLProps<LiHTMLAttributes<HTMLLIElement>, HTMLLIElement> & ExtraProps
>(
  LiComponent,
  (p, n) => p.children === n.children && p.className === n.className,
);
MemoLi.displayName = 'MarkdownLi';

const MemoInput = memo<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> &
    ExtraProps
>(
  InputComponent,
  (p, n) =>
    p.type === n.type && p.checked === n.checked && p.className === n.className,
);
MemoInput.displayName = 'MarkdownInput';
