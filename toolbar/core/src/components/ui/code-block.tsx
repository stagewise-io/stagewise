'use client';

import { type HTMLAttributes, useEffect, useRef, useState } from 'react';
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type SpecialLanguage,
  type ThemeRegistrationAny,
  type ShikiTransformer,
} from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { cn } from '@/utils';
import CodeBlockLightTheme from './code-block-light-theme.json';
import CodeBlockDarkTheme from './code-block-dark-theme.json';
import type { Element } from 'hast';

const PRE_TAG_REGEX = /<pre(\s|>)/;

type CodeBlockProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  code: string;
  language: BundledLanguage;
  preClassName?: string;
  hideActionButtons?: boolean;
  compactDiff?: boolean; // Will only show the diff lines and surrounding lines if the diff is larger than 10 lines
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
  private themes: [ThemeRegistrationAny, ThemeRegistrationAny] = [
    CodeBlockLightTheme as ThemeRegistrationAny,
    CodeBlockDarkTheme as ThemeRegistrationAny,
  ];
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
        ? [...this.loadedLanguages].concat(
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

    const light = this.lightHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[0],
      transformers: [
        shikiDiffNotation(),
        shikiCodeLineNumbers({}),
        shikiDiffCollapse({
          enabled: compactDiff ?? false,
          includeSurroundingLines: 2,
        }),
      ],
    });

    const dark = this.darkHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[1],
      transformers: [
        shikiDiffNotation(),
        shikiCodeLineNumbers({}),
        shikiDiffCollapse({
          enabled: compactDiff ?? false,
          includeSurroundingLines: 2,
        }),
      ],
    });

    const addPreClass = (html: string) => {
      if (!preClassName) {
        return html;
      }
      return html.replace(PRE_TAG_REGEX, `<pre class="${preClassName}"$1`);
    };

    return [addPreClass(light!), addPreClass(dark!)];
  }
}

// Create a singleton instance of the highlighter manager
const highlighterManager = new HighlighterManager();

// We use custom notation for diff s in the code block to prevent any confusion with the actual code
export const lineAddedDiffMarker = '/*>> STAGEWISE_ADDED_LINE <<*/';
export const lineRemovedDiffMarker = '/*>> STAGEWISE_REMOVED_LINE <<*/';

export const CodeBlock = ({
  code,
  language,
  className,
  preClassName = 'flex flex-row gap-2 font-mono text-xs',
  hideActionButtons,
  compactDiff,
  ...rest
}: CodeBlockProps) => {
  const [html, setHtml] = useState<string>('');
  const [darkHtml, setDarkHtml] = useState<string>('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

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
  }, [code, language, preClassName, compactDiff]);

  return (
    <div
      data-code-block-container
      data-language={language}
      className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-black/30 w-full overflow-auto overscroll-contain rounded-lg border border-foreground/5 bg-background/10"
    >
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
    </div>
  );
};

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
      // If this feature is enabled (according to the config), we collapse everything aroung the diffs (remove the lines and prevent them from being rendered).
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

      const displayedLinesMask = new Array(lineElements.length).fill(false);
      diffLineIndexes.forEach((index) => {
        displayedLinesMask[index] = true;
      });

      // Now, we make one forward and one backwards pass over the displayed lines mask and we set the lines to true if they are within the includeSurroundingLines config.
      // We check this by setting a "last line with diff" index and updatign that whenever we see a true value in the displayed lines mask.
      // Then, we check if the distance isn't too high (smaller than or equal to includeSurroundingLines) and if so, we set the mask to true at this point.
      // (Glenn): I couldn't come up with a more fficient way of doing this. I have a gut feel this is not performant enough but meh.
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

      // Now that we now which lines should be rendered and which shouldn't, we go over the line numb er elements and the line elements and remove the ones that shouldn't be rendered.
      // We go reverse over the entries because removing entries will shift the indices of the remaining entries so we have to do the stuff reverse.
      // Also, we delete the line break after the last line element that's not hidden. (We go reverse, so we delete the line after the first non-hidden line element.)
      let clearedLastDisplayLineBreak = false;
      displayedLinesMask
        .reverse()
        .forEach((shouldRenderIndex, revserseIndex) => {
          const index = displayedLinesMask.length - revserseIndex - 1;

          if (!shouldRenderIndex) {
            this.addClassToHast(
              codeElement.children[index * 2] as unknown as Element,
              'code-line-collapsed',
            );

            codeElement.children.splice(index * 2 + 1, 1);

            this.addClassToHast(
              lineNumbersContainer?.children[index] as unknown as Element,
              'code-line-number-collapsed',
            );
          } else if (!clearedLastDisplayLineBreak) {
            clearedLastDisplayLineBreak = true;
            codeElement.children.splice(index * 2 + 1, 1);
          }
        });
    },
  };
}
