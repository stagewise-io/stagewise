import { Streamdown as StreamdownBase } from 'streamdown';
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
} from 'react';
import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import type { BundledLanguage } from 'shiki';
import type { ExtraProps } from 'react-markdown';

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
        }}
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

  console.log(JSON.parse(JSON.stringify(node)));

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

  if (language === 'mermaid') {
    return (
      <div
        className={cn(
          'group relative my-4 h-auto rounded-2xl bg-zinc-500/5 p-2',
          className,
        )}
        data-streamdown="mermaid-block"
      >
        {!isStreaming && (
          <div className="flex items-center justify-end gap-2">
            <CodeBlockCopyButton code={code} />
          </div>
        )}
        <Mermaid
          chart={code}
          config={{
            theme: 'default',
          }}
        />
      </div>
    );
  }

  return (
    <CodeBlock
      className={cn('overflow-x-auto', className)}
      code={code}
      data-language={language}
      data-streamdown="code-block"
      language={language}
      isStreaming={isStreaming}
      preClassName="overflow-x-auto font-mono text-xs p-4"
    >
      {!isStreaming && (
        <div className="flex items-center justify-end gap-2">
          <CodeBlockCopyButton code={code} />
        </div>
      )}
    </CodeBlock>
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
