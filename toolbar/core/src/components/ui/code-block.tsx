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

const PRE_TAG_REGEX = /<pre(\s|>)/;

type CodeBlockProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  code: string;
  language: BundledLanguage;
  preClassName?: string;
  hideActionButtons?: boolean;
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
      transformers: [shikiDiffNotation()],
    });

    const dark = this.darkHighlighter?.codeToHtml(code, {
      lang,
      theme: this.themes[1],
      transformers: [shikiDiffNotation()],
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
  preClassName = 'overflow-x-auto font-mono text-xs p-4',
  hideActionButtons,
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
