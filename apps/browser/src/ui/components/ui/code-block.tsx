'use client';

import { type HTMLAttributes, useEffect, useRef, useState, memo } from 'react';
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type SpecialLanguage,
  type ThemeRegistrationAny,
  type ShikiTransformer,
} from 'shiki';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { cn } from '@ui/utils';
import CodeBlockLightTheme from './code-block-light-theme.json';
import CodeBlockDarkTheme from './code-block-dark-theme.json';
import type { Element } from 'hast';

const PRE_TAG_REGEX = /<pre(\s|>)/;

export type CodeBlockTheme = {
  light: ThemeRegistrationAny;
  dark: ThemeRegistrationAny;
};

// =============================================================================
// Theme Utilities
// =============================================================================

/**
 * Extracts the theme name from a theme object
 */
function getThemeName(theme: ThemeRegistrationAny): string {
  // Theme can have name at the top level
  if (typeof theme === 'object' && theme !== null && 'name' in theme)
    return String(theme.name);

  return 'unknown-theme';
}

/**
 * Extracts bracket highlight colors from a theme's colors object
 * Returns an array of colors in order (foreground1, foreground2, etc.)
 * Only includes colors that are defined in the theme
 */
function getBracketHighlightColors(theme: ThemeRegistrationAny): string[] {
  const colors: string[] = [];

  if (typeof theme !== 'object' || theme === null || !('colors' in theme))
    return colors;

  const themeColors = theme.colors as Record<string, string> | undefined;
  if (!themeColors) return colors;

  // Extract colors in order, stopping when we hit an undefined one
  for (let i = 1; i <= 6; i++) {
    const colorKey = `editorBracketHighlight.foreground${i}`;
    const color = themeColors[colorKey];
    if (color) colors.push(color);
  }

  return colors;
}

/**
 * Creates the transformerColorizedBrackets config for a theme
 * Returns undefined if no bracket colors are defined
 */
function createBracketTransformerConfig(
  theme: ThemeRegistrationAny,
): Parameters<typeof transformerColorizedBrackets>[0] | undefined {
  const themeName = getThemeName(theme);
  const bracketColors = getBracketHighlightColors(theme);

  if (bracketColors.length === 0) return undefined;

  return {
    themes: {
      [themeName]: bracketColors,
    },
  };
}

type CodeBlockProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  code: string;
  language: BundledLanguage;
  preClassName?: string;
  hideActionButtons?: boolean;
  compactDiff?: boolean; // Will only show the diff lines and surrounding lines if the diff is larger than 10 lines
  theme?: CodeBlockTheme;
};

// Default theme using the generated theme files
export const defaultCodeBlockTheme: CodeBlockTheme = {
  light: CodeBlockLightTheme as ThemeRegistrationAny,
  dark: CodeBlockDarkTheme as ThemeRegistrationAny,
};

class HighlighterManager {
  private lightHighlighter: Awaited<
    ReturnType<typeof createHighlighter>
  > | null = null;
  private darkHighlighter: Awaited<
    ReturnType<typeof createHighlighter>
  > | null = null;
  private readonly loadedLanguages: Set<BundledLanguage> = new Set();
  private initializationPromise: Promise<void> | null = null;
  private themes: [ThemeRegistrationAny, ThemeRegistrationAny];

  constructor(theme: CodeBlockTheme = defaultCodeBlockTheme) {
    this.themes = [theme.light, theme.dark];
  }
  private isLanguageSupported(language: string): language is BundledLanguage {
    return Object.hasOwn(bundledLanguages, language);
  }

  private getFallbackLanguage(): SpecialLanguage {
    return 'text';
  }

  private async ensureHighlightersInitialized(
    language: BundledLanguage,
  ): Promise<void> {
    const jsEngine = createJavaScriptRegexEngine({ forgiving: true });

    // Check if we need to recreate highlighters due to theme change
    const needsLightRecreation = !this.lightHighlighter;
    const needsDarkRecreation = !this.darkHighlighter;

    if (needsLightRecreation || needsDarkRecreation) {
      // If themes changed, reset loaded languages
      this.loadedLanguages.clear();
    }

    // Check if we need to load the language
    const isLanguageSupported = this.isLanguageSupported(language);
    const needsLanguageLoad =
      !this.loadedLanguages.has(language) && isLanguageSupported;

    // Create or recreate light highlighter if needed
    if (needsLightRecreation) {
      this.lightHighlighter = await createHighlighter({
        themes: [this.themes[0]],
        langs: isLanguageSupported ? [language] : [],
        engine: jsEngine,
      });
      if (isLanguageSupported) {
        this.loadedLanguages.add(language);
      }
    } else if (needsLanguageLoad) {
      // Load the language if not already loaded
      await this.lightHighlighter?.loadLanguage(language);
    }

    // Create or recreate dark highlighter if needed
    if (needsDarkRecreation) {
      // If recreating dark highlighter, load all previously loaded languages plus the new one
      const langsToLoad = needsLanguageLoad
        ? [...Array.from(this.loadedLanguages)].concat(
            isLanguageSupported ? [language] : [],
          )
        : Array.from(this.loadedLanguages);

      this.darkHighlighter = await createHighlighter({
        themes: [this.themes[1]],
        langs:
          langsToLoad.length > 0
            ? langsToLoad
            : isLanguageSupported
              ? [language]
              : [],
        engine: jsEngine,
      });
    } else if (needsLanguageLoad) {
      // Load the language if not already loaded
      await this.darkHighlighter?.loadLanguage(language);
    }

    // Mark language as loaded after both highlighters have it
    if (needsLanguageLoad) {
      this.loadedLanguages.add(language);
    }
  }

  async highlightCode(
    code: string,
    language: BundledLanguage,
    preClassName?: string,
    compactDiff?: boolean,
  ): Promise<[string, string]> {
    // Ensure only one initialization happens at a time
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    // Initialize or load language
    this.initializationPromise = this.ensureHighlightersInitialized(language);
    await this.initializationPromise;
    this.initializationPromise = null;

    const lang = this.isLanguageSupported(language)
      ? language
      : this.getFallbackLanguage();

    // Build transformers for each theme
    const buildTransformers = (
      theme: ThemeRegistrationAny,
    ): ShikiTransformer[] => {
      const transformers: ShikiTransformer[] = [];

      // Add bracket colorization if theme has bracket colors
      const bracketConfig = createBracketTransformerConfig(theme);
      if (bracketConfig)
        transformers.push(transformerColorizedBrackets(bracketConfig));
      else transformers.push(transformerColorizedBrackets());

      // Add other transformers
      transformers.push(
        shikiDiffNotation(),
        shikiCodeLineNumbers({}),
        shikiDiffCollapse({
          enabled: compactDiff ?? false,
          includeSurroundingLines: 2,
        }),
      );

      return transformers;
    };

    const light = this.lightHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[0],
      transformers: buildTransformers(this.themes[0]),
    });

    const dark = this.darkHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[1],
      transformers: buildTransformers(this.themes[1]),
    });

    const addPreClass = (html: string) => {
      if (!preClassName) {
        return html;
      }
      return html.replace(PRE_TAG_REGEX, `<pre class="${preClassName}"$1`);
    };

    const addCodeScroll = (html: string) => {
      // Add overflow-x: auto and scrollbar-subtle to code element so it scrolls instead of the container
      // Also add min-width: 0 and flex: 1 to allow proper shrinking in flex container
      // Explicitly set overflow-y: visible to prevent vertical scrollbar (scrollbar-subtle sets overflow: auto)
      return html.replace(/<code([^>]*)>/, (_match, attrs) => {
        const flexStyles =
          'overflow-x: auto; overflow-y: visible; min-width: 0; flex: 1;';
        // Check if there's already a class attribute
        if (attrs.includes('class=')) {
          // Add to existing class
          const withClass = attrs.replace(
            /class="([^"]*)"/,
            'class="$1 scrollbar-subtle"',
          );
          return `<code${withClass} style="${flexStyles}">`;
        } else {
          // Add new class attribute
          return `<code${attrs} class="scrollbar-subtle" style="${flexStyles}">`;
        }
      });
    };

    return [
      addCodeScroll(addPreClass(light!)),
      addCodeScroll(addPreClass(dark!)),
    ];
  }
}

// Cache of highlighter managers keyed by theme identity
// Using WeakMap would be ideal but themes are plain objects, so we use a Map with a string key
const highlighterManagerCache = new Map<string, HighlighterManager>();

function getThemeKey(theme: CodeBlockTheme): string {
  // Create a unique key based on theme names or a hash of the theme
  const lightName =
    (theme.light as { name?: string }).name ||
    JSON.stringify(theme.light).slice(0, 100);
  const darkName =
    (theme.dark as { name?: string }).name ||
    JSON.stringify(theme.dark).slice(0, 100);
  return `${lightName}::${darkName}`;
}

function getHighlighterManager(
  theme: CodeBlockTheme = defaultCodeBlockTheme,
): HighlighterManager {
  const key = getThemeKey(theme);
  let manager = highlighterManagerCache.get(key);
  if (!manager) {
    manager = new HighlighterManager(theme);
    highlighterManagerCache.set(key, manager);
  }
  return manager;
}

// We use custom notation for diff s in the code block to prevent any confusion with the actual code
export const lineAddedDiffMarker = '/*>> STAGEWISE_ADDED_LINE <<*/';
export const lineRemovedDiffMarker = '/*>> STAGEWISE_REMOVED_LINE <<*/';

export const CodeBlock = memo(
  ({
    code,
    language,
    className,
    preClassName = 'flex flex-row font-mono text-xs w-full',
    hideActionButtons,
    compactDiff,
    theme = defaultCodeBlockTheme,
    ...rest
  }: CodeBlockProps) => {
    const [html, setHtml] = useState<string>('');
    const [darkHtml, setDarkHtml] = useState<string>('');
    const mounted = useRef(false);

    useEffect(() => {
      mounted.current = true;

      const highlighterManager = getHighlighterManager(theme);
      highlighterManager
        .highlightCode(code, language, preClassName, compactDiff)
        .then(([light, dark]) => {
          if (mounted.current) {
            setHtml(light);
            setDarkHtml(dark);
          }
        });

      return () => {
        mounted.current = false;
      };
    }, [code, language, preClassName, compactDiff, theme]);

    return (
      <>
        <div
          className={cn('group/chat-bubble-user:hidden dark:hidden', className)}
          dangerouslySetInnerHTML={{ __html: html }}
          data-code-block
          data-language={language}
          {...rest}
        />
        <div
          className={cn(
            'hidden group/chat-bubble-user:block dark:block',
            className,
          )}
          dangerouslySetInnerHTML={{ __html: darkHtml }}
          data-code-block
          data-language={language}
          {...rest}
        />
      </>
    );
  },
  // Custom comparison - only re-render if code content, language, or theme changes
  (prevProps, nextProps) =>
    prevProps.code === nextProps.code &&
    prevProps.language === nextProps.language &&
    prevProps.compactDiff === nextProps.compactDiff &&
    prevProps.className === nextProps.className &&
    prevProps.theme === nextProps.theme,
);

function shikiDiffNotation(): ShikiTransformer {
  const classLineAdd = 'code-block-diff-add';
  const classLineRemove = 'code-block-diff-remove';

  return {
    name: 'shiki-diff-notation',
    code(node) {
      // if (!this.options.meta?.diff) return;
      const lines = node.children.filter((node) => node.type === 'element');
      lines.forEach((line) => {
        if (lineStartsWith(line, lineAddedDiffMarker)) {
          lineSlice(line, lineAddedDiffMarker.length);
          this.addClassToHast(line, classLineAdd);
        }
        if (lineStartsWith(line, lineRemovedDiffMarker)) {
          lineSlice(line, lineRemovedDiffMarker.length);
          this.addClassToHast(line, classLineRemove);
        }
      });
    },
  };
}

const lineStartsWith = (line: Element, marker: string) => {
  const lineText = line.children.reduce<string>(
    (curr, node) =>
      curr +
      (node.type === 'element' && node.children[0]?.type === 'text'
        ? node.children[0].value
        : ''),
    '',
  );
  return lineText.startsWith(marker);
};

/** Iterates over the children of the line, performing a "slice" over all text from start to end.
 * Mutates the line's children so only the text within [start, end) remains.
 * We change the line element in place.
 **/
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
    ) {
      continue;
    }
    const textNode = child.children[0];
    const textValue = textNode.value;
    const textLen = textValue.length;

    currentIndex -= textLen;

    const childStart = currentIndex;
    const childEnd = childStart + textLen;

    // If this entire child is outside of the slice range, remove it
    if (childEnd <= sliceStart || childStart >= sliceEnd) {
      line.children.splice(i, 1);
    } else {
      // This child is (partially) within range
      // Figure out the slice to cut into this chunk
      const cutStart = Math.max(0, sliceStart - childStart);
      const cutEnd = Math.min(textLen, sliceEnd - childStart);
      textNode.value = textValue.slice(cutStart, cutEnd);
    }
  }

  // After splicing, could be empty elements, so filter out children with empty text
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

        // if the line is an add, we show an empty entry instead of a line number and also don't increment the current line.
        const isLineElement =
          element.type === 'element' && element.tagName === 'span';
        if (!isLineElement) {
          return acc;
        }

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
        properties: {
          class: ['line-numbers-container'],
        },
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
      // If this feature is enabled (according to the config), we collapse everything around the diffs (remove the lines and prevent them from being rendered).
      // We may include lines before and after the diffs if configured to do so.
      // We need to watch out that in the code block, after every "line" element, there is a text with the content "\n". This should be omitted as well if we should collapse those lines.

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

      // First, we create an array of all line numbers that are diff lines. (The lines listed here can be unrelated to the actual line of code, it's the index in the array of line elements)
      const diffLineIndexes = lineElements.reduce<number[]>(
        (acc, element, index) => {
          if (
            element.properties.class &&
            Array.isArray(element.properties.class) &&
            (element.properties.class.includes('code-block-diff-add') ||
              element.properties.class.includes('code-block-diff-remove'))
          ) {
            acc.push(index);
          }
          return acc;
        },
        [],
      );

      // If no diffs, nothing to collapse
      if (diffLineIndexes.length === 0) return;

      // Get boundaries of the diff region for determining edge vs middle
      const firstDiffIndex = Math.min(...diffLineIndexes);
      const lastDiffIndex = Math.max(...diffLineIndexes);

      const displayedLinesMask = new Array(lineElements.length).fill(false);
      diffLineIndexes.forEach((index) => {
        displayedLinesMask[index] = true;
      });

      // Now, we make one forward and one backwards pass over the displayed lines mask and we set the lines to true if they are within the includeSurroundingLines config.
      // We check this by setting a "last line with diff" index and updating that whenever we see a true value in the displayed lines mask.
      // Then, we check if the distance isn't too high (smaller than or equal to includeSurroundingLines) and if so, we set the mask to true at this point.
      let lastLineWithDiffIndex = -(includeSurroundingLines + 1);
      for (let i = 0; i < displayedLinesMask.length; i++) {
        if (displayedLinesMask[i]) {
          lastLineWithDiffIndex = i;
        }
        if (i - lastLineWithDiffIndex <= includeSurroundingLines) {
          displayedLinesMask[i] = true;
        }
      }

      lastLineWithDiffIndex =
        displayedLinesMask.length + includeSurroundingLines;
      for (let i = displayedLinesMask.length - 1; i >= 0; i--) {
        if (displayedLinesMask[i]) {
          lastLineWithDiffIndex = i;
        }
        if (lastLineWithDiffIndex - i <= includeSurroundingLines) {
          displayedLinesMask[i] = true;
        }
      }

      // First pass: classify each line and build a classification array
      type LineClassification =
        | 'visible'
        | 'edge-top'
        | 'edge-bottom'
        | 'middle';
      const lineClassifications: LineClassification[] = displayedLinesMask.map(
        (shouldRender, index) => {
          if (shouldRender) return 'visible';
          if (index < firstDiffIndex) return 'edge-top';
          if (index > lastDiffIndex) return 'edge-bottom';
          return 'middle';
        },
      );

      // Second pass: find groups of consecutive 'middle' lines and count them
      // We'll store the count on the last line of each group
      const middleGroupCounts: Map<number, number> = new Map();
      let currentMiddleGroupStart = -1;
      let currentMiddleGroupCount = 0;

      for (let i = 0; i <= lineClassifications.length; i++) {
        const classification = lineClassifications[i];
        if (classification === 'middle') {
          if (currentMiddleGroupStart === -1) {
            currentMiddleGroupStart = i;
          }
          currentMiddleGroupCount++;
        } else {
          // End of a middle group (or never started one)
          if (currentMiddleGroupCount > 0) {
            // Store count on the last index of this group
            const lastIndexOfGroup = i - 1;
            middleGroupCounts.set(lastIndexOfGroup, currentMiddleGroupCount);
          }
          currentMiddleGroupStart = -1;
          currentMiddleGroupCount = 0;
        }
      }

      // Now apply classes and remove line breaks, going in reverse
      let clearedLastDisplayLineBreak = false;
      displayedLinesMask
        .slice()
        .reverse()
        .forEach((shouldRender, reverseIndex) => {
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

            // If this is the last line of a middle group, add the count and inject text
            const groupCount = middleGroupCounts.get(index);
            if (groupCount !== undefined) {
              lineElement.properties = lineElement.properties || {};
              lineElement.properties['data-hidden-count'] = String(groupCount);
              // Clear existing children and add the "X hidden lines" text
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
