/**
 * Node-native Tree-sitter WASM parser.
 *
 * Replaces the browser-specific parser from the stash (which used Vite
 * `?url` imports and `fetch()`) with `createRequire` + `fs.readFile`
 * for locating and loading WASM binaries in the Electron main process.
 *
 * - `initParser()` — lazy-initialises the WASM runtime and returns a
 *   fresh `Parser` instance. Callers must call `parser.delete()` when
 *   done.
 * - `loadGrammar()` — loads (and caches) a language grammar by its
 *   `.wasm` filename from `@vscode/tree-sitter-wasm`.
 */

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

// web-tree-sitter uses named exports (no default).
// `Parser.init()` is static, `Language.load()` is static,
// and `new Parser()` constructs a parser instance.
import { Parser, Language } from 'web-tree-sitter';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Singleton init
// ---------------------------------------------------------------------------

let initPromise: Promise<void> | null = null;

function resolveWasmPath(pkg: string, subpath: string): string {
  return require.resolve(`${pkg}/${subpath}`);
}

/**
 * Initialise the Tree-sitter WASM runtime (once) and return a new
 * `Parser` instance. Each caller gets its own parser so concurrent
 * parses don't interfere. The caller is responsible for calling
 * `parser.delete()` after use.
 */
export async function initParser(): Promise<Parser> {
  if (!initPromise) {
    const wasmPath = resolveWasmPath('web-tree-sitter', 'web-tree-sitter.wasm');
    initPromise = Parser.init({
      locateFile: () => wasmPath,
    }).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return new Parser();
}

// ---------------------------------------------------------------------------
// Grammar cache
// ---------------------------------------------------------------------------

const grammarCache = new Map<string, Promise<Language>>();

/**
 * Load a Tree-sitter language grammar by its `.wasm` filename
 * (e.g. `"tree-sitter-typescript.wasm"`).
 *
 * Grammars are cached after first load — the WASM binary is read from
 * disk via `@vscode/tree-sitter-wasm` and compiled once. Concurrent
 * first-loads of the same grammar share a single in-flight promise.
 */
export async function loadGrammar(grammarFile: string): Promise<Language> {
  const cached = grammarCache.get(grammarFile);
  if (cached) return cached;

  const promise = (async () => {
    const wasmPath = resolveWasmPath(
      '@vscode/tree-sitter-wasm',
      `wasm/${grammarFile}`,
    );
    const bytes = new Uint8Array(await fs.readFile(wasmPath));
    return Language.load(bytes);
  })();

  grammarCache.set(grammarFile, promise);

  // If loading fails, evict from cache so future attempts retry.
  promise.catch(() => {
    grammarCache.delete(grammarFile);
  });

  return promise;
}
