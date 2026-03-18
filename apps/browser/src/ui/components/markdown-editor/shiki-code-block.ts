import CodeBlock, { type CodeBlockOptions } from '@tiptap/extension-code-block';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createHighlightPlugin } from 'prosemirror-highlight';
import { createParser, type Parser } from 'prosemirror-highlight/shiki';
import {
  type BundledLanguage,
  type ThemeRegistrationAny,
  bundledLanguages,
  createHighlighter,
} from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import CodeBlockLightTheme from '../ui/code-block-light-theme.json';
import CodeBlockDarkTheme from '../ui/code-block-dark-theme.json';
import { CodeBlockNodeView } from './code-block-node-view';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined;
let highlighterPromise: Promise<void> | undefined;
const loadedLanguages = new Set<string>();

async function loadHighlighter(): Promise<void> {
  const engine = createJavaScriptRegexEngine({ forgiving: true });
  highlighter = await createHighlighter({
    themes: [
      CodeBlockLightTheme as ThemeRegistrationAny,
      CodeBlockDarkTheme as ThemeRegistrationAny,
    ],
    langs: [],
    engine,
  });
}

async function loadLanguage(lang: string): Promise<void> {
  if (
    !highlighter ||
    loadedLanguages.has(lang) ||
    !Object.hasOwn(bundledLanguages, lang)
  )
    return;

  await highlighter.loadLanguage(lang as BundledLanguage);
  loadedLanguages.add(lang);
}

let syncParser: Parser | undefined;

const lazyParser: Parser = (options) => {
  // 1. Highlighter not ready → kick off init, return promise
  if (!highlighter) {
    if (!highlighterPromise) {
      highlighterPromise = loadHighlighter().then(() => {
        highlighterPromise = undefined;
      });
    }
    return highlighterPromise;
  }

  const lang = options.language ?? '';
  if (lang && !loadedLanguages.has(lang) && lang in bundledLanguages)
    return loadLanguage(lang);

  if (!syncParser) {
    syncParser = createParser(highlighter, {
      themes: {
        light: 'stagewise-light',
        dark: 'stagewise-dark',
      },
    });
  }

  return syncParser(options);
};

export const ShikiCodeBlock = CodeBlock.extend<CodeBlockOptions>({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      createHighlightPlugin({ parser: lazyParser }),
    ];
  },
});
