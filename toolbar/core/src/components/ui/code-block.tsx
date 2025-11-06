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
        shikiDiffCollapse({ enabled: true, includeSurroundingLines: 2 }),
      ],
    });

    const dark = this.darkHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[1],
      transformers: [
        shikiDiffNotation(),
        shikiCodeLineNumbers({}),
        shikiDiffCollapse({ enabled: false, includeSurroundingLines: 2 }),
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

export const CodeBlock = ({
  code,
  language,
  className,
  preClassName = 'flex flex-row gap-1.5 overflow-x-auto font-mono text-xs p-2',
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
      .highlightCode(code, language, preClassName)
      .then(([light, dark]) => {
        if (mounted.current) {
          setHtml(light);
          setDarkHtml(dark);
        }
      });

    return () => {
      mounted.current = false;
    };
  }, [code, language, preClassName]);

  return (
    <div
      data-code-block-container
      data-language={language}
      className="w-full overflow-hidden rounded-lg border border-black/5 dark:border-white/5"
    >
      <div className="min-w-full">
        <div
          className={cn('overflow-x-auto dark:hidden', className)}
          dangerouslySetInnerHTML={{ __html: html }}
          data-code-block
          data-language={language}
          {...rest}
        />
        <div
          className={cn('hidden overflow-x-auto dark:block', className)}
          dangerouslySetInnerHTML={{ __html: darkHtml }}
          data-code-block
          data-language={language}
          {...rest}
        />
      </div>
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
        for (const child of line.children) {
          if (child.type !== 'element') continue;
          const text = child.children[0];
          if (text?.type !== 'text') continue;
          if (text.value.startsWith('+')) {
            text.value = text.value.slice(1);
            this.addClassToHast(line, classLineAdd);
          }
          if (text.value.startsWith('-')) {
            text.value = text.value.slice(1);
            this.addClassToHast(line, classLineRemove);
          }
        }
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
      console.log(node);
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
          class: [
            'line-numbers-container',
            'flex',
            'flex-col',
            'items-end',
            'justify-start',
            'text-muted-foreground',
            'select-none',
          ],
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

      console.log('Node: ', node);

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

      console.log('Line elements: ', lineElements);

      const lineNumberElements = Array.from(
        lineNumbersContainer?.children ?? [],
      );

      console.log('Line number elements: ', lineNumberElements);

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

      console.log('Diff line indexes: ', diffLineIndexes);

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

      console.log('Displayed lines mask: ', displayedLinesMask);

      // Now that we now which lines should be rendered and which shouldn't, we go over the line numb er elements and the line elements and remove the ones that shouldn't be rendered.
      // We go reverse over the entries because removing entries will shift the indices of the remaining entries so we have to do the stuff reverse.
      displayedLinesMask
        .reverse()
        .forEach((shouldRenderIndex, revserseIndex) => {
          const index = displayedLinesMask.length - revserseIndex - 1;
          if (!shouldRenderIndex) {
            this.addClassToHast(
              codeElement.children[index * 2] as unknown as Element,
              'code-line-collapsed',
            );
            // We remove the line break that follows after every line element in the code element.
            codeElement.children.splice(index * 2 + 1, 1);
            this.addClassToHast(
              lineNumbersContainer?.children[index] as unknown as Element,
              'code-line-number-collapsed',
            );
            // codeElement.children.splice(index * 2, 2); // We multiply by two because after every line entry, there is a line break text entry in this children array. We also remove two entries because we don't want there to be an unused line break.
            // lineNumbersContainer?.children.splice(index, 1);
          }
        });
    },
  };
}
