'use client';

import posthog from 'posthog-js';
import { type HTMLAttributes, useEffect, useRef, useState, memo } from 'react';
import type { BundledLanguage, ThemeRegistrationAny } from 'shiki';
import { cn } from '@ui/utils';
import CodeBlockLightTheme from './code-block-light-theme.json';
import CodeBlockDarkTheme from './code-block-dark-theme.json';
import { getHighlightCache } from '@ui/hooks/use-shiki-highlighter-cache';
import { getShikiWorkerProxy } from './shiki-worker-proxy';

export type CodeBlockTheme = {
  light: ThemeRegistrationAny;
  dark: ThemeRegistrationAny;
};

type CodeBlockProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  code: string;
  language: BundledLanguage;
  preClassName?: string;
  hideActionButtons?: boolean;
  compactDiff?: boolean;
  theme?: CodeBlockTheme;
};

// Default theme using the generated theme files
export const defaultCodeBlockTheme: CodeBlockTheme = {
  light: CodeBlockLightTheme as ThemeRegistrationAny,
  dark: CodeBlockDarkTheme as ThemeRegistrationAny,
};

export const lineAddedDiffMarker = '/*>> STAGEWISE_ADDED_LINE <<*/';
export const lineRemovedDiffMarker = '/*>> STAGEWISE_REMOVED_LINE <<*/';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COLLAPSE_SURROUNDING = 2;

/**
 * Builds plain-text fallback HTML that mirrors the Shiki transformer pipeline
 * (diff marker stripping, diff classes, diff-aware line numbers, compact-diff
 * collapse) so the fallback has identical dimensions to the highlighted output.
 */
function buildPlainTextFallbackHtml(
  code: string,
  preClassName: string,
  compactDiff?: boolean,
): string {
  const rawLines = code.split('\n');

  // Parse lines: strip markers, classify as add/remove/unchanged
  const parsed = rawLines.map((raw) => {
    if (raw.startsWith(lineAddedDiffMarker)) {
      const text = raw
        .slice(lineAddedDiffMarker.length)
        .split(lineAddedDiffMarker)
        .join('')
        .split(lineRemovedDiffMarker)
        .join('');
      return { text, kind: 'add' as const };
    }
    if (raw.startsWith(lineRemovedDiffMarker)) {
      const text = raw
        .slice(lineRemovedDiffMarker.length)
        .split(lineAddedDiffMarker)
        .join('')
        .split(lineRemovedDiffMarker)
        .join('');
      return { text, kind: 'remove' as const };
    }
    const text = raw
      .split(lineAddedDiffMarker)
      .join('')
      .split(lineRemovedDiffMarker)
      .join('');
    return { text, kind: 'unchanged' as const };
  });

  // Compute visibility mask when compactDiff is enabled
  const hasDiffs = parsed.some((l) => l.kind !== 'unchanged');
  const useCollapse = (compactDiff ?? false) && hasDiffs;
  const visible = new Array<boolean>(parsed.length).fill(!useCollapse);

  let firstDiffIdx = 0;
  let lastDiffIdx = 0;

  if (useCollapse) {
    const diffIdxs: number[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i]!.kind !== 'unchanged') diffIdxs.push(i);
    }
    for (const idx of diffIdxs) visible[idx] = true;
    firstDiffIdx = diffIdxs[0]!;
    lastDiffIdx = diffIdxs[diffIdxs.length - 1]!;

    let last = -(COLLAPSE_SURROUNDING + 1);
    for (let i = 0; i < visible.length; i++) {
      if (visible[i]) last = i;
      if (i - last <= COLLAPSE_SURROUNDING) visible[i] = true;
    }
    last = visible.length + COLLAPSE_SURROUNDING;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i]) last = i;
      if (last - i <= COLLAPSE_SURROUNDING) visible[i] = true;
    }
  }

  // Classify hidden lines and count middle groups
  type LineVis = 'visible' | 'edge-top' | 'edge-bottom' | 'middle';
  const vis: LineVis[] = visible.map((v, i) => {
    if (v) return 'visible';
    if (i < firstDiffIdx) return 'edge-top';
    if (i > lastDiffIdx) return 'edge-bottom';
    return 'middle';
  });

  const middleCounts = new Map<number, number>();
  if (useCollapse) {
    let cnt = 0;
    for (let i = 0; i <= vis.length; i++) {
      if (vis[i] === 'middle') {
        cnt++;
      } else {
        if (cnt > 0) middleCounts.set(i - 1, cnt);
        cnt = 0;
      }
    }
  }

  // Build line-numbers + code-lines HTML in a single pass
  const lnParts: string[] = [];
  const codeParts: string[] = [];
  let lineCounter = 0;

  for (let i = 0; i < parsed.length; i++) {
    const { text, kind } = parsed[i]!;
    const v = vis[i]!;

    if (v === 'edge-top' || v === 'edge-bottom') continue;

    if (v === 'middle') {
      const groupCount = middleCounts.get(i);
      if (groupCount !== undefined) {
        lnParts.push(
          '<span class="line-number code-line-number-collapsed-middle"> </span>',
        );
        codeParts.push(
          `<span class="line code-line-collapsed-middle" data-hidden-count="${groupCount}">${groupCount} hidden line${groupCount === 1 ? '' : 's'}</span>`,
        );
      } else {
        lnParts.push(
          '<span class="line-number code-line-number-collapsed-middle"> </span>',
        );
        codeParts.push('<span class="line code-line-collapsed-middle"></span>');
      }
      if (kind !== 'add') lineCounter++;
      continue;
    }

    // Visible line
    if (kind === 'add') lnParts.push('<span class="line-number"> </span>');
    else {
      lineCounter++;
      lnParts.push(`<span class="line-number">${lineCounter}</span>`);
    }

    const diffCls =
      kind === 'add'
        ? ' code-block-diff-add'
        : kind === 'remove'
          ? ' code-block-diff-remove'
          : '';
    const nl = i < parsed.length - 1 && v === 'visible' ? '\n' : '';
    codeParts.push(
      `<span class="line${diffCls}">${escapeHtml(text)}${nl}</span>`,
    );
  }

  return (
    `<pre class="${escapeHtml(preClassName)}">` +
    `<div class="line-numbers-container">${lnParts.join('')}</div>` +
    `<code class="scrollbar-subtle" style="overflow-x: auto; overflow-y: visible; min-width: 0; flex: 1;">${codeParts.join('')}</code>` +
    '</pre>'
  );
}

// Global cache instance
const highlightCache = getHighlightCache();

export const CodeBlock = memo(
  ({
    code,
    language,
    className,
    preClassName = 'flex flex-row font-mono text-xs w-full select-text',
    hideActionButtons,
    compactDiff,
    theme = defaultCodeBlockTheme,
    ...rest
  }: CodeBlockProps) => {
    // Check cache FIRST - if we have a cache hit, use it immediately
    const cachedEntry = highlightCache.get(
      code,
      language,
      preClassName,
      compactDiff,
    );

    // State holds worker results for cache misses
    const [workerHtml, setWorkerHtml] = useState<string>('');

    // Synchronous render path: always prefer cache hit over state.
    // This ensures cache hits are used immediately on every render,
    // not just on first mount (useState initial value is ignored on re-renders).
    const html = cachedEntry?.html || workerHtml;

    const mountedRef = useRef(true);

    // Highlight on mount or when code/language changes
    useEffect(() => {
      mountedRef.current = true;

      // Check cache first
      const cached = highlightCache.get(
        code,
        language,
        preClassName,
        compactDiff,
      );

      if (cached) {
        // Cache hit: sync render path already uses cachedEntry.html,
        // so skip the worker call entirely.
        return () => {
          mountedRef.current = false;
        };
      }

      // Cache miss: dispatch to web worker
      getShikiWorkerProxy()
        .highlightCode(code, language, preClassName, compactDiff, 'full')
        .then((highlighted) => {
          // Cache the result
          highlightCache.set(
            code,
            language,
            preClassName,
            compactDiff,
            highlighted,
          );

          // Update state only if still mounted
          if (mountedRef.current) {
            setWorkerHtml(highlighted);
          }
        })
        .catch((error) => {
          console.warn('CodeBlock: Highlighting failed', error);
          posthog.captureException(
            error instanceof Error ? error : new Error(String(error)),
            { source: 'renderer', operation: 'shikiHighlight' },
          );
        });

      return () => {
        mountedRef.current = false;
      };
    }, [code, language, preClassName, compactDiff]);

    // Plain-text fallback while waiting for worker (prevents layout shift)
    if (!html) {
      return (
        <div
          className={cn(className)}
          dangerouslySetInnerHTML={{
            __html: buildPlainTextFallbackHtml(code, preClassName, compactDiff),
          }}
          data-code-block
          data-language={language}
          {...rest}
        />
      );
    }

    return (
      <div
        className={cn(className)}
        dangerouslySetInnerHTML={{ __html: html }}
        data-code-block
        data-language={language}
        {...rest}
      />
    );
  },
  // Custom comparison - only re-render if code content, language, or theme changes
  (prevProps, nextProps) =>
    prevProps.code === nextProps.code &&
    prevProps.language === nextProps.language &&
    prevProps.compactDiff === nextProps.compactDiff &&
    prevProps.className === nextProps.className &&
    prevProps.preClassName === nextProps.preClassName &&
    prevProps.theme === nextProps.theme,
);
