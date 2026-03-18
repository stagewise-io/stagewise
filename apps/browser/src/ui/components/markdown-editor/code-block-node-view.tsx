import {
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@ui/utils';
import { Mermaid } from '../ui/mermaid';

type MermaidMode = 'view' | 'edit' | 'split';

const MERMAID_DEBOUNCE_MS = 400;

/**
 * Custom NodeView for code blocks.
 *
 * - Non-mermaid blocks: renders the default editable code area.
 * - Mermaid blocks: adds a rendered diagram preview with view/edit/split toggle.
 */
export function CodeBlockNodeView({ node }: NodeViewProps) {
  const language = (node.attrs.language as string) ?? '';
  const isMermaid = language === 'mermaid';

  if (!isMermaid) {
    return (
      <NodeViewWrapper as="pre">
        <NodeViewContent<'code'> as="code" />
      </NodeViewWrapper>
    );
  }

  return <MermaidCodeBlock node={node} />;
}

/**
 * Mermaid code block with view/edit/split toggle.
 *
 * The editable `<NodeViewContent>` is always mounted (ProseMirror requires it)
 * but visually hidden in "view" mode.
 */
function MermaidCodeBlock({ node }: { node: NodeViewProps['node'] }) {
  const [mode, setMode] = useState<MermaidMode>('view');
  const [debouncedChart, setDebouncedChart] = useState(node.textContent);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce chart content updates for the preview
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedChart(node.textContent);
    }, MERMAID_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [node.textContent]);

  const showCode = mode === 'edit' || mode === 'split';
  const showPreview = mode === 'view' || mode === 'split';

  return (
    <NodeViewWrapper
      as="div"
      className="mermaid-block"
      data-mermaid-mode={mode}
    >
      {/* Toolbar */}
      <div className="mermaid-block-toolbar" contentEditable={false}>
        <div className="mermaid-block-toggle">
          <button
            type="button"
            className={cn(
              'mermaid-toggle-btn',
              mode === 'view' && 'mermaid-toggle-btn-active',
            )}
            onClick={() => setMode('view')}
            title="View diagram"
          >
            View
          </button>
          <button
            type="button"
            className={cn(
              'mermaid-toggle-btn',
              mode === 'split' && 'mermaid-toggle-btn-active',
            )}
            onClick={() => setMode('split')}
            title="Side by side"
          >
            Split
          </button>
          <button
            type="button"
            className={cn(
              'mermaid-toggle-btn',
              mode === 'edit' && 'mermaid-toggle-btn-active',
            )}
            onClick={() => setMode('edit')}
            title="Edit source"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className={cn(
          'mermaid-block-body',
          mode === 'split' && 'mermaid-block-body-split',
        )}
      >
        {/*
         * Code editor — always in the DOM (ProseMirror requirement).
         * Visually collapsed when mode === 'view'.
         */}
        <div
          className={cn(
            'mermaid-code-area',
            !showCode && 'mermaid-code-area-hidden',
          )}
        >
          <pre>
            <NodeViewContent<'code'> as="code" />
          </pre>
        </div>

        {/* Diagram preview */}
        {showPreview && debouncedChart.trim() && (
          <div className="mermaid-preview-area" contentEditable={false}>
            <Mermaid
              chart={debouncedChart}
              config={{ theme: 'default' }}
              className="mermaid-preview-diagram w-full"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
