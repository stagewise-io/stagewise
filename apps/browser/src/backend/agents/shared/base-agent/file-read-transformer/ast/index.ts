/**
 * AST index module — Node entry point.
 *
 * Provides `getFileSymbols()`, the single public API for parsing source
 * code and extracting top-level symbols. Internally wires up the
 * Node-native parser, grammar loader, and symbol extractor.
 */

import type { ParsedFileSymbols } from '@shared/ast/types';
import { getLanguageForExt } from '@shared/ast/language-map';
import { initParser, loadGrammar } from './parser';
import { extractSymbols } from './symbol-extractor';

export type { ParsedFileSymbols } from '@shared/ast/types';
export { SymbolKind, type SymbolInfo } from '@shared/ast/types';
export { getLanguageForExt } from '@shared/ast/language-map';

/**
 * Parse source code and extract top-level symbols.
 *
 * @param sourceText — UTF-8 source code string (NOT a URL or file path).
 * @param ext — File extension without leading dot (e.g. `'ts'`, `'py'`, `'go'`).
 * @returns Parsed symbols, or `null` if the extension has no grammar.
 */
export async function getFileSymbols(
  sourceText: string,
  ext: string,
): Promise<ParsedFileSymbols | null> {
  const lang = getLanguageForExt(ext);
  if (!lang) return null;

  const parser = await initParser();
  let tree: ReturnType<typeof parser.parse> | null = null;

  try {
    const language = await loadGrammar(lang.grammarFile);
    parser.setLanguage(language);
    tree = parser.parse(sourceText);
    if (!tree) return null;

    const symbols = extractSymbols(
      tree.rootNode,
      lang.grammarFile,
      sourceText,
      ext,
    );
    return { language: lang.label, symbols };
  } finally {
    tree?.delete();
    parser.delete();
  }
}
