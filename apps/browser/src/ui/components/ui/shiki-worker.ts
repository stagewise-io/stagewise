import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type ThemeRegistrationAny,
  type ShikiTransformer,
} from 'shiki';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import shikiWasm from 'shiki/wasm';
import {
  generateCacheKey,
  MAX_CACHE_SIZE,
  IDB_STORE_NAME,
  openHighlightDB,
} from './highlight-cache-key';
import CodeBlockLightTheme from './code-block-light-theme.json';
import CodeBlockDarkTheme from './code-block-dark-theme.json';
import type { Element } from 'hast';

export type HighlightRequest = {
  id: number;
  code: string;
  language: string;
  preClassName?: string;
  compactDiff?: boolean;
  mode: 'full' | 'streaming';
};

export type HighlightResponse =
  | { id: number; html: string }
  | { id: number; error: string };

const lineAddedDiffMarker = '/*>> STAGEWISE_ADDED_LINE <<*/';
const lineRemovedDiffMarker = '/*>> STAGEWISE_REMOVED_LINE <<*/';

const PRE_TAG_REGEX = /<pre(\s|>)/;

const themes: [ThemeRegistrationAny, ThemeRegistrationAny] = [
  CodeBlockLightTheme as ThemeRegistrationAny,
  CodeBlockDarkTheme as ThemeRegistrationAny,
];

function getThemeName(theme: ThemeRegistrationAny): string {
  if (typeof theme === 'object' && theme !== null && 'name' in theme)
    return String(theme.name);
  return 'unknown-theme';
}

function getBracketHighlightColors(theme: ThemeRegistrationAny): string[] {
  const colors: string[] = [];
  if (typeof theme !== 'object' || theme === null || !('colors' in theme))
    return colors;
  const themeColors = theme.colors as Record<string, string> | undefined;
  if (!themeColors) return colors;
  for (let i = 1; i <= 6; i++) {
    const colorKey = `editorBracketHighlight.foreground${i}`;
    const color = themeColors[colorKey];
    if (color) colors.push(color);
  }
  return colors;
}

function addPreClass(html: string, preClassName?: string): string {
  if (!preClassName) return html;
  if (html.includes('<pre class="')) {
    return html.replace(/<pre class="/, `<pre class="${preClassName} `);
  }
  return html.replace(PRE_TAG_REGEX, `<pre class="${preClassName}"$1`);
}

function addCodeScroll(html: string): string {
  return html.replace(/<code([^>]*)>/, (_match, attrs) => {
    const flexStyles =
      'overflow-x: auto; overflow-y: visible; min-width: 0; flex: 1;';
    if (attrs.includes('class=')) {
      const withClass = attrs.replace(
        /class="([^"]*)"/,
        'class="$1 scrollbar-subtle"',
      );
      return `<code${withClass} style="${flexStyles}">`;
    }
    return `<code${attrs} class="scrollbar-subtle" style="${flexStyles}">`;
  });
}

const getLineText = (line: Element): string => {
  return line.children.reduce<string>(
    (curr, node) =>
      curr +
      (node.type === 'element' && node.children[0]?.type === 'text'
        ? node.children[0].value
        : ''),
    '',
  );
};

const stripMarkersFromMiddle = (line: Element): void => {
  const fullText = getLineText(line);
  if (
    !fullText.includes(lineAddedDiffMarker) &&
    !fullText.includes(lineRemovedDiffMarker)
  )
    return;

  const cleanedText = fullText
    .split(lineAddedDiffMarker)
    .join('')
    .split(lineRemovedDiffMarker)
    .join('');

  if (cleanedText !== fullText) {
    const firstChild = line.children[0];
    const style =
      firstChild?.type === 'element' ? firstChild.properties?.style : undefined;
    line.children = [
      {
        type: 'element',
        tagName: 'span',
        properties: style ? { style } : {},
        children: [{ type: 'text', value: cleanedText }],
      },
    ];
  }
};

const lineSlice = (line: Element, start?: number, end?: number) => {
  if (start === undefined && end === undefined) return line;

  const sliceStart = start ?? 0;
  const sliceEnd = end ?? Number.POSITIVE_INFINITY;

  let currentIndex = line.children.reduce<number>(
    (curr, node) =>
      curr +
      (node.type === 'element' && node.children[0]?.type === 'text'
        ? node.children[0].value.length
        : 0),
    0,
  );

  for (let i = line.children.length - 1; i >= 0; i--) {
    const child = line.children[i];
    if (
      child?.type !== 'element' ||
      !child.children[0] ||
      child.children[0].type !== 'text'
    )
      continue;
    const textNode = child.children[0];
    const textValue = textNode.value;
    const textLen = textValue.length;

    currentIndex -= textLen;

    const childStart = currentIndex;
    const childEnd = childStart + textLen;

    if (childEnd <= sliceStart || childStart >= sliceEnd) {
      line.children.splice(i, 1);
    } else {
      const cutStart = Math.max(0, sliceStart - childStart);
      const cutEnd = Math.min(textLen, sliceEnd - childStart);
      textNode.value = textValue.slice(cutStart, cutEnd);
    }
  }

  line.children = line.children.filter(
    (child) =>
      !(
        child.type === 'element' &&
        child.children[0] &&
        child.children[0].type === 'text' &&
        child.children[0].value.length === 0
      ),
  );

  return line;
};

function shikiDiffNotation(): ShikiTransformer {
  const classLineAdd = 'code-block-diff-add';
  const classLineRemove = 'code-block-diff-remove';

  return {
    name: 'shiki-diff-notation',
    code(node) {
      const lines = node.children.filter((node) => node.type === 'element');
      lines.forEach((line) => {
        const lineText = getLineText(line as Element);
        const startsWithAdd = lineText.startsWith(lineAddedDiffMarker);
        const startsWithRemove = lineText.startsWith(lineRemovedDiffMarker);

        if (startsWithAdd) {
          lineSlice(line, lineAddedDiffMarker.length);
          this.addClassToHast(line, classLineAdd);
        } else if (startsWithRemove) {
          lineSlice(line, lineRemovedDiffMarker.length);
          this.addClassToHast(line, classLineRemove);
        }

        stripMarkersFromMiddle(line as Element);
      });
    },
  };
}

function shikiCodeLineNumbers({
  startLine,
}: {
  startLine?: number;
}): ShikiTransformer {
  return {
    name: 'shiki-code-line-numbers',
    pre(node) {
      const lineElements = Array.from(
        (
          node.children.find(
            (node) => node.type === 'element' && node.tagName === 'code',
          ) as unknown as Element
        ).children,
      ).filter(
        (node) =>
          node.type === 'element' &&
          node.tagName === 'span' &&
          node.properties.class &&
          (node.properties.class === 'line' ||
            (Array.isArray(node.properties.class) &&
              node.properties.class.includes('line'))),
      ) as Element[];

      const lineNumberElements = lineElements.reduce<
        { currentLine: number; element: Element }[]
      >((acc, element) => {
        const prevLine = acc[acc.length - 1]?.currentLine ?? startLine ?? 0;

        const isLineElement =
          element.type === 'element' && element.tagName === 'span';
        if (!isLineElement) return acc;

        const isAdd =
          isLineElement &&
          element.properties.class &&
          Array.isArray(element.properties.class) &&
          element.properties.class.includes('code-block-diff-add');

        acc.push({
          currentLine: isAdd ? prevLine : prevLine + 1,
          element: {
            type: 'element',
            tagName: 'span',
            properties: { class: 'line-number' },
            children: [
              { type: 'text', value: isAdd ? ' ' : `${prevLine + 1}` },
            ],
          },
        });
        return acc;
      }, []);

      node.children.unshift({
        type: 'element',
        tagName: 'div',
        properties: { class: ['line-numbers-container'] },
        children: lineNumberElements.map(({ element }) => element),
      });
    },
  };
}

function shikiDiffCollapse({
  enabled,
  includeSurroundingLines = 2,
}: {
  enabled: boolean;
  includeSurroundingLines?: number;
}): ShikiTransformer {
  return {
    name: 'shiki-diff-collapse',
    pre(node) {
      if (!enabled) return;

      const codeElement = node.children.find(
        (node) => node.type === 'element' && node.tagName === 'code',
      ) as unknown as Element;

      const lineNumbersContainer = node.children.find(
        (node) =>
          node.type === 'element' &&
          node.tagName === 'div' &&
          node.properties.class &&
          Array.isArray(node.properties.class) &&
          node.properties.class.includes('line-numbers-container'),
      ) as unknown as Element;

      const lineElements = Array.from(codeElement.children).filter(
        (node) =>
          node.type === 'element' &&
          node.tagName === 'span' &&
          node.properties.class &&
          (node.properties.class === 'line' ||
            (Array.isArray(node.properties.class) &&
              node.properties.class.includes('line'))),
      ) as Element[];

      const diffLineIndexes = lineElements.reduce<number[]>(
        (acc, element, index) => {
          if (
            element.properties.class &&
            Array.isArray(element.properties.class) &&
            (element.properties.class.includes('code-block-diff-add') ||
              element.properties.class.includes('code-block-diff-remove'))
          )
            acc.push(index);
          return acc;
        },
        [],
      );

      if (diffLineIndexes.length === 0) return;

      const firstDiffIndex = Math.min(...diffLineIndexes);
      const lastDiffIndex = Math.max(...diffLineIndexes);

      const displayedLinesMask = new Array(lineElements.length).fill(false);
      diffLineIndexes.forEach((index) => {
        displayedLinesMask[index] = true;
      });

      let lastLineWithDiffIndex = -(includeSurroundingLines + 1);
      for (let i = 0; i < displayedLinesMask.length; i++) {
        if (displayedLinesMask[i]) lastLineWithDiffIndex = i;
        if (i - lastLineWithDiffIndex <= includeSurroundingLines)
          displayedLinesMask[i] = true;
      }

      lastLineWithDiffIndex =
        displayedLinesMask.length + includeSurroundingLines;
      for (let i = displayedLinesMask.length - 1; i >= 0; i--) {
        if (displayedLinesMask[i]) lastLineWithDiffIndex = i;
        if (lastLineWithDiffIndex - i <= includeSurroundingLines)
          displayedLinesMask[i] = true;
      }

      type LineClassification =
        | 'visible'
        | 'edge-top'
        | 'edge-bottom'
        | 'middle';
      const lineClassifications: LineClassification[] = displayedLinesMask.map(
        (shouldRender: boolean, index: number) => {
          if (shouldRender) return 'visible';
          if (index < firstDiffIndex) return 'edge-top';
          if (index > lastDiffIndex) return 'edge-bottom';
          return 'middle';
        },
      );

      const middleGroupCounts: Map<number, number> = new Map();
      let currentMiddleGroupStart = -1;
      let currentMiddleGroupCount = 0;

      for (let i = 0; i <= lineClassifications.length; i++) {
        const classification = lineClassifications[i];
        if (classification === 'middle') {
          if (currentMiddleGroupStart === -1) currentMiddleGroupStart = i;
          currentMiddleGroupCount++;
        } else {
          if (currentMiddleGroupCount > 0) {
            const lastIndexOfGroup = i - 1;
            middleGroupCounts.set(lastIndexOfGroup, currentMiddleGroupCount);
          }
          currentMiddleGroupStart = -1;
          currentMiddleGroupCount = 0;
        }
      }

      let clearedLastDisplayLineBreak = false;
      displayedLinesMask
        .slice()
        .reverse()
        .forEach((shouldRender: boolean, reverseIndex: number) => {
          const index = displayedLinesMask.length - reverseIndex - 1;
          const classification = lineClassifications[index];

          if (!shouldRender) {
            let collapseClass: string;
            let lineNumberCollapseClass: string;

            if (classification === 'edge-top') {
              collapseClass = 'code-line-collapsed-edge-top';
              lineNumberCollapseClass = 'code-line-number-collapsed-edge-top';
            } else if (classification === 'edge-bottom') {
              collapseClass = 'code-line-collapsed-edge-bottom';
              lineNumberCollapseClass =
                'code-line-number-collapsed-edge-bottom';
            } else {
              collapseClass = 'code-line-collapsed-middle';
              lineNumberCollapseClass = 'code-line-number-collapsed-middle';
            }

            const lineElement = codeElement.children[
              index * 2
            ] as unknown as Element;

            this.addClassToHast(lineElement, collapseClass);

            const groupCount = middleGroupCounts.get(index);
            if (groupCount !== undefined) {
              lineElement.properties = lineElement.properties || {};
              lineElement.properties['data-hidden-count'] = String(groupCount);
              lineElement.children = [
                {
                  type: 'text',
                  value: `${groupCount} hidden line${groupCount === 1 ? '' : 's'}`,
                },
              ];
            }

            codeElement.children.splice(index * 2 + 1, 1);

            this.addClassToHast(
              lineNumbersContainer?.children[index] as unknown as Element,
              lineNumberCollapseClass,
            );
          } else if (!clearedLastDisplayLineBreak) {
            clearedLastDisplayLineBreak = true;
            codeElement.children.splice(index * 2 + 1, 1);
          }
        });
    },
  };
}

function streamingLineNumbers(): ShikiTransformer {
  return {
    name: 'streaming-line-numbers',
    pre(node) {
      const codeElement = node.children.find(
        (child) => child.type === 'element' && child.tagName === 'code',
      ) as Element | undefined;

      if (!codeElement) return;

      const lineElements = codeElement.children.filter(
        (child) =>
          child.type === 'element' &&
          child.tagName === 'span' &&
          child.properties?.class &&
          (child.properties.class === 'line' ||
            (Array.isArray(child.properties.class) &&
              child.properties.class.includes('line'))),
      );

      const lineNumberElements: Element[] = lineElements.map((_, index) => ({
        type: 'element',
        tagName: 'span',
        properties: { class: 'line-number' },
        children: [{ type: 'text', value: `${index + 1}` }],
      }));

      node.children.unshift({
        type: 'element',
        tagName: 'div',
        properties: { class: ['line-numbers-container'] },
        children: lineNumberElements,
      });
    },
  };
}

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;
const loadedLanguages = new Set<string>();
let initPromise: Promise<void> | null = null;

function isLanguageSupported(language: string): language is BundledLanguage {
  return Object.hasOwn(bundledLanguages, language);
}

async function ensureHighlighter(language: string): Promise<void> {
  if (!highlighter) {
    const engine = createOnigurumaEngine(shikiWasm);
    const langs = isLanguageSupported(language) ? [language] : [];
    highlighter = await createHighlighter({
      themes: [themes[0], themes[1]],
      langs,
      engine,
    });
    if (isLanguageSupported(language)) loadedLanguages.add(language);
    return;
  }

  if (isLanguageSupported(language) && !loadedLanguages.has(language)) {
    await highlighter.loadLanguage(language as BundledLanguage);
    loadedLanguages.add(language);
  }
}

async function highlight(req: HighlightRequest): Promise<string> {
  if (initPromise) await initPromise;
  initPromise = ensureHighlighter(req.language);
  await initPromise;
  initPromise = null;

  const lang = isLanguageSupported(req.language) ? req.language : 'text';

  const lightThemeName = getThemeName(themes[0]);
  const darkThemeName = getThemeName(themes[1]);

  let transformers: ShikiTransformer[];

  if (req.mode === 'full') {
    const bracketThemes: Record<string, string[]> = {};
    const lightBrackets = getBracketHighlightColors(themes[0]);
    const darkBrackets = getBracketHighlightColors(themes[1]);
    if (lightBrackets.length > 0) bracketThemes[lightThemeName] = lightBrackets;
    if (darkBrackets.length > 0) bracketThemes[darkThemeName] = darkBrackets;

    transformers = [
      Object.keys(bracketThemes).length > 0
        ? transformerColorizedBrackets({ themes: bracketThemes })
        : transformerColorizedBrackets(),
      shikiDiffNotation(),
      shikiCodeLineNumbers({}),
      shikiDiffCollapse({
        enabled: req.compactDiff ?? false,
        includeSurroundingLines: 2,
      }),
    ];
  } else {
    transformers = [streamingLineNumbers()];
  }

  const html = highlighter!.codeToHtml(req.code, {
    lang,
    themes: { light: lightThemeName, dark: darkThemeName },
    defaultColor: 'light',
    transformers,
  });

  return addCodeScroll(addPreClass(html, req.preClassName));
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openHighlightDB().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function persistToIDB(key: string, html: string): void {
  getDB()
    .then((db) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.put({ key, html, accessTime: Date.now() });

      // LRU eviction: count entries, delete oldest if over limit
      const countReq = store.count();
      countReq.onsuccess = () => {
        const total = countReq.result;
        if (total <= MAX_CACHE_SIZE) return;
        const toDelete = total - MAX_CACHE_SIZE;
        const idx = store.index('accessTime');
        const cursor = idx.openCursor();
        let deleted = 0;
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c || deleted >= toDelete) return;
          c.delete();
          deleted++;
          c.continue();
        };
      };
    })
    .catch(() => {
      // IDB failures are non-fatal
    });
}

self.onmessage = async (e: MessageEvent<HighlightRequest>) => {
  const req = e.data;
  try {
    const html = await highlight(req);
    // Post result back immediately
    self.postMessage({ id: req.id, html } satisfies HighlightResponse);
    // Fire-and-forget IDB persistence (only for 'full' mode — streaming results are transient)
    if (req.mode === 'full') {
      const cacheKey = generateCacheKey(
        req.code,
        req.language,
        req.preClassName,
        req.compactDiff,
      );
      persistToIDB(cacheKey, html);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      id: req.id,
      error: message,
    } satisfies HighlightResponse);
  }
};
