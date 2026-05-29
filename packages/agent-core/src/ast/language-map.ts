export interface LanguageGrammar {
  grammarFile: string;
  label: string;
}

export const LANGUAGE_MAP: Record<string, LanguageGrammar | null> = {
  ts: { grammarFile: 'tree-sitter-typescript.wasm', label: 'TypeScript' },
  tsx: { grammarFile: 'tree-sitter-tsx.wasm', label: 'TypeScript React' },
  js: {
    grammarFile: 'tree-sitter-javascript.wasm',
    label: 'JavaScript',
  },
  jsx: {
    grammarFile: 'tree-sitter-javascript.wasm',
    label: 'JavaScript React',
  },
  mjs: {
    grammarFile: 'tree-sitter-javascript.wasm',
    label: 'JavaScript',
  },
  cjs: {
    grammarFile: 'tree-sitter-javascript.wasm',
    label: 'JavaScript',
  },
  py: { grammarFile: 'tree-sitter-python.wasm', label: 'Python' },
  go: { grammarFile: 'tree-sitter-go.wasm', label: 'Go' },
  rs: { grammarFile: 'tree-sitter-rust.wasm', label: 'Rust' },
  java: { grammarFile: 'tree-sitter-java.wasm', label: 'Java' },
  css: { grammarFile: 'tree-sitter-css.wasm', label: 'CSS' },
  scss: null,
  less: null,
  sh: { grammarFile: 'tree-sitter-bash.wasm', label: 'Shell' },
  bash: { grammarFile: 'tree-sitter-bash.wasm', label: 'Bash' },
  zsh: { grammarFile: 'tree-sitter-bash.wasm', label: 'Zsh' },
  rb: { grammarFile: 'tree-sitter-ruby.wasm', label: 'Ruby' },
  php: { grammarFile: 'tree-sitter-php.wasm', label: 'PHP' },
  cs: { grammarFile: 'tree-sitter-c-sharp.wasm', label: 'C#' },
  cpp: { grammarFile: 'tree-sitter-cpp.wasm', label: 'C++' },
  c: { grammarFile: 'tree-sitter-cpp.wasm', label: 'C' },
  h: { grammarFile: 'tree-sitter-cpp.wasm', label: 'C Header' },
  hpp: { grammarFile: 'tree-sitter-cpp.wasm', label: 'C++ Header' },
  // No grammar available in @vscode/tree-sitter-wasm
  html: null,
  xml: null,
  svg: null,
  json: null,
  yaml: null,
  yml: null,
  toml: null,
  md: null,
  mdx: null,
  sql: null,
  kt: null,
  scala: null,
  swift: null,
  vue: null,
  svelte: null,
};

export function getLanguageForExt(ext: string): LanguageGrammar | null {
  return LANGUAGE_MAP[ext] ?? null;
}
