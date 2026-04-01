'use client';

import { useEffect, useRef, useState, memo } from 'react';
import type { BundledLanguage } from 'shiki';
import { cn } from '@ui/utils';
import { getShikiWorkerProxy } from './shiki-worker-proxy';

// =============================================================================
// Language Detection Utility
// =============================================================================

/**
 * Extracts the programming language from a file path based on its extension.
 * Falls back to 'text' if the extension is not recognized.
 */
export function getLanguageFromPath(filePath?: string | null): BundledLanguage {
  if (!filePath) return 'text' as BundledLanguage;

  const filename = filePath.replace(/^.*[\\/]/, '');
  const extension = filename?.split('.').pop()?.toLowerCase();

  if (!extension) return 'text' as BundledLanguage;

  const extensionMap: Record<string, BundledLanguage> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    php: 'php',
    vue: 'vue',
    svelte: 'svelte',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    mdx: 'mdx',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    graphql: 'graphql',
    gql: 'graphql',
    xml: 'xml',
    toml: 'toml',
    ini: 'ini',
    env: 'dotenv',
    prisma: 'prisma',
    astro: 'astro',
  };

  return extensionMap[extension] ?? (extension as BundledLanguage);
}

// =============================================================================
// Streaming Code Block Component
// =============================================================================

interface StreamingCodeBlockProps {
  code: string;
  language: BundledLanguage;
  className?: string;
  preClassName?: string;
}

const HIGHLIGHT_DEBOUNCE_SMALL_MS = 100;
const HIGHLIGHT_DEBOUNCE_LARGE_MS = 800;
const LARGE_CODE_THRESHOLD = 1000;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEFAULT_PRE_CLASS_NAME =
  'flex flex-row font-mono text-xs w-full select-text';

export const StreamingCodeBlock = memo(
  ({
    code,
    language,
    className,
    preClassName = DEFAULT_PRE_CLASS_NAME,
  }: StreamingCodeBlockProps) => {
    const [html, setHtml] = useState<string>('');
    const [hasHighlighted, setHasHighlighted] = useState(false);

    // Version tracking to ignore stale results
    const versionRef = useRef(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
      mountedRef.current = true;

      versionRef.current += 1;
      const currentVersion = versionRef.current;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const doHighlight = () => {
        getShikiWorkerProxy()
          .highlightCode(code, language, preClassName, undefined, 'streaming')
          .then((highlighted) => {
            if (mountedRef.current && currentVersion === versionRef.current) {
              setHtml(highlighted);
              setHasHighlighted(true);
            }
          })
          .catch(() => {
            // Worker errors are non-fatal for streaming; plain-text fallback remains
          });
      };

      const delay =
        code.length > LARGE_CODE_THRESHOLD
          ? HIGHLIGHT_DEBOUNCE_LARGE_MS
          : HIGHLIGHT_DEBOUNCE_SMALL_MS;

      debounceRef.current = setTimeout(doHighlight, delay);

      return () => {
        mountedRef.current = false;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      };
    }, [code, language, preClassName]);

    if (!hasHighlighted) {
      const lines = code.split('\n');
      const lineNumbersHtml = lines
        .map((_, i) => `<span class="line-number">${i + 1}</span>`)
        .join('');
      const codeHtml = lines
        .map(
          (line, i) =>
            `<span class="line">${escapeHtml(line)}${i < lines.length - 1 ? '\n' : ''}</span>`,
        )
        .join('');

      return (
        <pre className={cn(preClassName, className)}>
          <div
            className="line-numbers-container"
            dangerouslySetInnerHTML={{ __html: lineNumbersHtml }}
          />
          <code
            className="scrollbar-subtle"
            style={{
              overflowX: 'auto',
              overflowY: 'visible',
              minWidth: 0,
              flex: 1,
            }}
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        </pre>
      );
    }

    return (
      <div
        className={cn(
          '[&_code]:text-xs [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.code === nextProps.code &&
    prevProps.language === nextProps.language &&
    prevProps.className === nextProps.className &&
    prevProps.preClassName === nextProps.preClassName,
);

StreamingCodeBlock.displayName = 'StreamingCodeBlock';
