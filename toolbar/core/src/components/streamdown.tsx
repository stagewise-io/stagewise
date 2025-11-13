import { defaultRehypePlugins, Streamdown as StreamdownBase } from 'streamdown';
import { FileIcon } from 'lucide-react';
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
import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
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
      >
        {children}
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
        <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-foreground/30 max-h-96 overflow-auto overscroll-contain rounded-lg border border-foreground/5 bg-background/10 p-2">
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
  const logoResetTiemoutRef = useRef<number | null>(null);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setHasCopied(true);
    if (logoResetTiemoutRef.current) {
      clearTimeout(logoResetTiemoutRef.current);
    }
    logoResetTiemoutRef.current = setTimeout(
      () => setHasCopied(false),
      2000,
    ) as unknown as number;
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

  const linkLabel = useMemo(() => {
    if (!href) return null;

    if (href.startsWith('wsfile:')) {
      const filePath = href.slice('wsfile:'.length);

      const truncatedFilePath = getTruncatedFileUrl(
        filePath.split(':')[0]!,
        3,
        128,
      );
      const lineNumber = filePath.split(':')[1];

      return `${truncatedFilePath}${lineNumber ? ` (Line ${lineNumber})` : ''}`;
    }

    return children;
  }, [href, children]);

  const conversationId = useKartonState(
    (s) => s.workspace?.agentChat?.activeChatId ?? 'unknown',
  );

  const filePathTools = useFileIDEHref();

  const processedHref = useMemo(() => {
    if (!href) return '';

    let finalHref = href;

    if (href.startsWith('wsfile:')) {
      finalHref = filePathTools.getFileIDEHref(href.slice('wsfile:'.length));
    }

    finalHref = finalHref.replaceAll(
      encodeURIComponent('{{CONVERSATION_ID}}'),
      conversationId,
    );

    return finalHref;
  }, [conversationId, filePathTools]);

  return (
    <Tooltip>
      <TooltipTrigger>
        <a
          href={processedHref}
          className={cn(
            'inline-flex items-baseline justify-start gap-0.5 font-medium text-primary hover:opacity-80',
            className,
          )}
          {...props}
        >
          {isFileLink && <FileIcon className="inline size-3.5 self-center" />}
          {linkLabel}
        </a>
      </TooltipTrigger>
      <TooltipContent>{processedHref}</TooltipContent>
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
