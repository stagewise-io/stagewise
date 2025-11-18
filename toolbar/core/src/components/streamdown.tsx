import { defaultRehypePlugins, Streamdown as StreamdownBase } from 'streamdown';
import { CodeBlock } from './ui/code-block';
import { Mermaid } from './ui/mermaid';
import {
  memo,
  type DetailedHTMLProps,
  type HTMLAttributes,
  useState,
  isValidElement,
  type ReactNode,
  useContext,
  createContext,
  useRef,
  type AnchorHTMLAttributes,
  useMemo,
} from 'react';
import { cn, IDE_SELECTION_ITEMS } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { CopyCheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import type { BundledLanguage } from 'shiki';
import type { ExtraProps } from 'react-markdown';
import { useKartonState } from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { getTruncatedFileUrl } from '@/utils';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { usePostHog } from 'posthog-js/react';

const LANGUAGE_REGEX = /language-([^\s]+)/;

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
 * Preprocesses markdown to handle incomplete wsfile: links during streaming
 * Converts incomplete markdown like [](wsfile:/path without closing ) to valid markdown
 *
 * Note: This runs on every render because it's called in JSX (line 105). However, once
 * the markdown is complete with a closing ), the regex won't match anymore, so the
 * function efficiently returns the input unchanged.
 */
const preprocessMarkdown = (markdown: string): string => {
  // Detect incomplete wsfile: links at the end of the string
  // Pattern: [any-text](wsfile:... without closing )
  const incompleteWsfileLinkRegex = /\[([^\]]*)\]\(wsfile:([^)]*?)$/;

  return markdown.replace(
    incompleteWsfileLinkRegex,
    (_match, linkText, partialPath) => {
      // Convert to complete markdown with special incomplete prefix
      const displayText = linkText || '...';
      return `[${displayText}](wsfile:incomplete:${partialPath})`;
    },
  );
};

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
        isAnimating={isAnimating}
        shikiTheme={['light-plus', 'dark-plus']}
        controls={{
          code: false,
          mermaid: false,
          table: true,
        }}
        components={{
          code: MemoCode,
          a: MemoAnchor,
        }}
        rehypePlugins={[defaultRehypePlugins.raw!, defaultRehypePlugins.katex!]}
        urlTransform={(url) => {
          return url;
        }}
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

  if (inline) {
    return (
      <code
        className={cn(
          'rounded bg-zinc-500/5 px-1.5 py-0.5 font-mono text-sm',
          className,
        )}
        data-streamdown="inline-code"
        {...props}
      >
        {children}
      </code>
    );
  }

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
        'group relative my-4 flex h-auto flex-col gap-1 rounded-2xl bg-zinc-500/5 p-2',
        language === 'mermaid' ? 'max-h-96' : 'max-h-64',
        className,
      )}
      data-streamdown={language === 'mermaid' ? 'mermaid-block' : 'code-block'}
    >
      <div className="flex shrink-0 flex-row items-center justify-between">
        <span className="ml-1.5 font-medium font-mono text-muted-foreground text-sm lowercase">
          {language}
        </span>
        {!isStreaming && (
          <div className="flex flex-row items-center justify-end gap-2">
            <CodeBlockCopyButton code={code} />
          </div>
        )}
      </div>
      {language === 'mermaid' ? (
        <div className="scrollbar-hover-only max-h-96 overflow-auto overscroll-contain rounded-lg border border-foreground/5 bg-background/10 p-2">
          <Mermaid
            chart={code}
            config={{
              theme: 'default',
            }}
            className="size-max min-h-full min-w-full"
          />
        </div>
      ) : (
        <CodeBlock
          code={code}
          data-language={language}
          data-streamdown="code-block"
          language={language}
          hideActionButtons={isStreaming}
        />
      )}
    </div>
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
  const posthog = usePostHog();
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
    posthog?.capture('agent_copied_code_to_clipboard');
  };

  return (
    <Button
      variant="secondary"
      size="icon-xs"
      className="bg-background/60"
      onClick={copyToClipboard}
    >
      {hasCopied ? (
        <CopyCheckIcon className="size-3" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </Button>
  );
};

const FileLink = ({
  filePath,
  lineNumber,
  href,
  ideKey,
  ideName,
}: {
  filePath: string;
  lineNumber?: string;
  href: string;
  ideName: string;
  ideKey: keyof typeof IDE_SELECTION_ITEMS;
}) => {
  const posthog = usePostHog();
  return (
    <Tooltip>
      <TooltipTrigger>
        <a
          href={href}
          onClick={() =>
            posthog?.capture('agent_file_opened_in_ide_via_chat_link', {
              file_path: filePath,
              ide: ideKey,
            })
          }
          className={cn(
            'inline-flex items-center gap-0.5',
            'font-medium text-primary text-sm',
            'hover:opacity-80',
            'transition-opacity duration-200',
          )}
        >
          {filePath}
          {lineNumber && <span className="opacity-70">:{lineNumber}</span>}
          <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-1">
          <div className="font-mono text-xs">{decodeURI(href)}</div>
          <div className="text-muted-foreground text-xs">
            Click to open in {ideName}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
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
  const isFileLink = useMemo(() => {
    return href?.startsWith('wsfile:');
  }, [href]);

  // Detect incomplete file links during streaming
  // Our preprocessing converts incomplete wsfile: URLs to "wsfile:incomplete:..." format
  const isIncompleteFileLink = useMemo(() => {
    return href?.startsWith('wsfile:incomplete:') ?? false;
  }, [href]);

  const conversationId = useKartonState(
    (s) => s.workspace?.agentChat?.activeChatId ?? 'unknown',
  );

  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);
  const ideName = IDE_SELECTION_ITEMS[openInIdeChoice];

  const filePathTools = useFileIDEHref();

  const { filePath, lineNumber } = useMemo(() => {
    if (!href?.startsWith('wsfile:'))
      return { filePath: null, lineNumber: null };

    // Handle both complete and incomplete wsfile links
    const prefix = href.startsWith('wsfile:incomplete:')
      ? 'wsfile:incomplete:'
      : 'wsfile:';
    const path = decodeURI(href.slice(prefix.length));
    const [file, line] = path.split(':');
    const truncated = getTruncatedFileUrl(file!, 3, 128);

    return { filePath: truncated, lineNumber: line };
  }, [href]);

  const processedHref = useMemo(() => {
    if (!href) return '';

    let finalHref = href;

    if (href.startsWith('wsfile:')) {
      // Remove the wsfile: (or wsfile:incomplete:) prefix before processing
      const prefix = href.startsWith('wsfile:incomplete:')
        ? 'wsfile:incomplete:'
        : 'wsfile:';
      finalHref = filePathTools.getFileIDEHref(href.slice(prefix.length));
    }

    finalHref = finalHref.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      conversationId,
    );

    return finalHref;
  }, [conversationId, filePathTools, href]);

  // Render file link bubble for wsfile: links or incomplete file links
  if (isFileLink || isIncompleteFileLink) {
    // Show complete link bubble for all other cases (valid markdown with extracted path)
    return (
      <FileLink
        filePath={filePath ?? '...'}
        lineNumber={lineNumber ?? undefined}
        href={processedHref}
        ideName={ideName}
        ideKey={openInIdeChoice}
      />
    );
  }

  // Regular link rendering
  return (
    <Tooltip>
      <TooltipTrigger>
        <a
          href={processedHref}
          target="_blank"
          className={cn(
            'inline-flex items-baseline justify-start gap-0.5 font-medium text-primary hover:opacity-80',
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
