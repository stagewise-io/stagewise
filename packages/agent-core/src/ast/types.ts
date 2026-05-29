export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Variable = 'variable',
  Method = 'method',
  Property = 'property',
  CssSelector = 'css-selector',
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  exported: boolean;
  line: number;
  /** Source signature (text before body), e.g. "function greet(name: string): string". */
  signature?: string;
  children?: SymbolInfo[];
}

export interface ParsedFileSymbols {
  language: string;
  symbols: SymbolInfo[];
}
