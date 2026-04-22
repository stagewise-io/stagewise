import type { Node } from 'web-tree-sitter';
import { SymbolKind, type SymbolInfo } from '@shared/ast/types';

type Extractor = (root: Node, source: string) => SymbolInfo[];

function nameOf(node: Node, field: string): string {
  return node.childForFieldName(field)?.text ?? '<anonymous>';
}

function isExported(node: Node): boolean {
  const parent = node.parent;
  return parent?.type === 'export_statement';
}

// ---------------------------------------------------------------------------
// Signature extraction
// ---------------------------------------------------------------------------

const SIGNATURE_MAX_LENGTH = 120;

interface SignatureOpts {
  maxLength?: number;
  stripTrailing?: string;
}

/**
 * Extract the source signature of a declaration node.
 *
 * Strategy: slice source text from node start to body start (the `{…}` or
 * `:` block).  When no body child exists, fall back to the first line of the
 * node's source range.
 */
function extractSignature(
  node: Node,
  sourceText: string,
  opts?: SignatureOpts,
): string {
  const maxLen = opts?.maxLength ?? SIGNATURE_MAX_LENGTH;

  let raw: string;
  const body = node.childForFieldName('body');
  if (body) {
    raw = sourceText.substring(node.startIndex, body.startIndex);
  } else {
    raw = sourceText.substring(node.startIndex, node.endIndex).split('\n')[0];
  }

  // Collapse newlines + surrounding whitespace into single space.
  raw = raw.replace(/\s*\n\s*/g, ' ').trim();

  // Strip trailing characters (e.g. ":" for Python).
  if (opts?.stripTrailing && raw.endsWith(opts.stripTrailing)) {
    raw = raw.slice(0, -opts.stripTrailing.length).trimEnd();
  }

  if (raw.length > maxLen) {
    raw = `${raw.slice(0, maxLen - 1)}…`;
  }

  return raw;
}

/** Prefix `export ` when the TS/JS node sits inside an `export_statement`. */
function tsSignature(node: Node, source: string): string {
  const sig = extractSignature(node, source);
  return isExported(node) ? `export ${sig}` : sig;
}

function extractTsSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function visitTopLevel(node: Node) {
    switch (node.type) {
      case 'function_declaration':
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Function,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
        });
        break;

      case 'class_declaration': {
        const children = extractClassMembers(node, source);
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Class,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
          children: children.length ? children : undefined,
        });
        break;
      }

      case 'abstract_class_declaration': {
        const children = extractClassMembers(node, source);
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Class,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
          children: children.length ? children : undefined,
        });
        break;
      }

      case 'interface_declaration':
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Interface,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
        });
        break;

      case 'type_alias_declaration':
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Type,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
        });
        break;

      case 'enum_declaration':
        symbols.push({
          name: nameOf(node, 'name'),
          kind: SymbolKind.Enum,
          exported: isExported(node),
          line: node.startPosition.row,
          signature: tsSignature(node, source),
        });
        break;

      case 'lexical_declaration': {
        for (const decl of node.namedChildren) {
          if (decl.type === 'variable_declarator') {
            // Slice up to the initializer (value) if present.
            const value = decl.childForFieldName('value');
            let sig: string;
            if (value) {
              sig = source
                .substring(decl.startIndex, value.startIndex)
                .replace(/\s*\n\s*/g, ' ')
                .trim()
                .replace(/\s*=\s*$/, '');
            } else {
              sig = source
                .substring(decl.startIndex, decl.endIndex)
                .split('\n')[0]
                .trim();
            }
            // Prepend const/let from the parent lexical_declaration.
            const keyword = node.children[0]?.text ?? 'const';
            const exportPrefix = isExported(node) ? 'export ' : '';
            symbols.push({
              name: nameOf(decl, 'name'),
              kind: SymbolKind.Variable,
              exported: isExported(node),
              line: decl.startPosition.row,
              signature: `${exportPrefix}${keyword} ${sig}`,
            });
          }
        }
        break;
      }

      case 'export_statement': {
        const child = node.namedChildren[0];
        if (child) visitTopLevel(child);
        break;
      }
    }
  }

  for (const child of root.namedChildren) {
    visitTopLevel(child);
  }
  return symbols;
}

function extractClassMembers(classNode: Node, source: string): SymbolInfo[] {
  const members: SymbolInfo[] = [];
  const body = classNode.childForFieldName('body');
  if (!body) return members;

  for (const member of body.namedChildren) {
    switch (member.type) {
      case 'method_definition':
        members.push({
          name: nameOf(member, 'name'),
          kind: SymbolKind.Method,
          exported: false,
          line: member.startPosition.row,
          signature: extractSignature(member, source),
        });
        break;
      case 'public_field_definition':
      case 'property_definition':
        members.push({
          name: nameOf(member, 'name'),
          kind: SymbolKind.Property,
          exported: false,
          line: member.startPosition.row,
          signature: extractSignature(member, source),
        });
        break;
    }
  }
  return members;
}

function extractPySymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    switch (child.type) {
      case 'function_definition':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Function,
          exported: true,
          line: child.startPosition.row,
          signature: extractSignature(child, source, { stripTrailing: ':' }),
        });
        break;

      case 'class_definition': {
        const methods: SymbolInfo[] = [];
        const body = child.childForFieldName('body');
        if (body) {
          for (const m of body.namedChildren) {
            let fn = m;
            if (fn.type === 'decorated_definition') {
              const inner = fn.namedChildren.find(
                (c) => c.type === 'function_definition',
              );
              if (!inner) continue;
              fn = inner;
            }
            if (fn.type === 'function_definition') {
              methods.push({
                name: nameOf(fn, 'name'),
                kind: SymbolKind.Method,
                exported: false,
                line: fn.startPosition.row,
                signature: extractSignature(fn, source, { stripTrailing: ':' }),
              });
            }
          }
        }
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Class,
          exported: true,
          line: child.startPosition.row,
          signature: extractSignature(child, source, { stripTrailing: ':' }),
          children: methods.length ? methods : undefined,
        });
        break;
      }

      case 'decorated_definition': {
        const inner = child.namedChildren.find(
          (c) =>
            c.type === 'function_definition' || c.type === 'class_definition',
        );
        if (inner) {
          const temp = extractPySymbols(fakeRoot([inner]), source);
          for (const s of temp) symbols.push(s);
        }
        break;
      }
    }
  }
  return symbols;
}

function extractGoSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    switch (child.type) {
      case 'function_declaration':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Function,
          exported: isGoExported(nameOf(child, 'name')),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'method_declaration':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Method,
          exported: isGoExported(nameOf(child, 'name')),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'type_declaration': {
        for (const spec of child.namedChildren) {
          if (spec.type === 'type_spec') {
            const typeName = nameOf(spec, 'name');
            const typeValue = spec.childForFieldName('type');
            const kind =
              typeValue?.type === 'interface_type'
                ? SymbolKind.Interface
                : SymbolKind.Type;
            symbols.push({
              name: typeName,
              kind,
              exported: isGoExported(typeName),
              line: spec.startPosition.row,
              signature: extractSignature(spec, source),
            });
          }
        }
        break;
      }
    }
  }
  return symbols;
}

function isGoExported(name: string): boolean {
  if (name.length === 0) return false;
  const ch = name[0];
  // Only Unicode uppercase *letters* make a Go name exported.
  // Reject `_`, digits, and other non-letter characters where
  // toUpperCase() === toLowerCase().
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function extractRsSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    switch (child.type) {
      case 'function_item':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Function,
          exported: hasRsPub(child),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'struct_item':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Class,
          exported: hasRsPub(child),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'enum_item':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Enum,
          exported: hasRsPub(child),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'trait_item':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Interface,
          exported: hasRsPub(child),
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;

      case 'impl_item': {
        const typeName = child.childForFieldName('type')?.text ?? '<impl>';
        const methods: SymbolInfo[] = [];
        const body = child.childForFieldName('body');
        if (body) {
          for (const m of body.namedChildren) {
            if (m.type === 'function_item') {
              methods.push({
                name: nameOf(m, 'name'),
                kind: SymbolKind.Method,
                exported: hasRsPub(m),
                line: m.startPosition.row,
                signature: extractSignature(m, source),
              });
            }
          }
        }
        symbols.push({
          name: typeName,
          kind: SymbolKind.Class,
          exported: false,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
          children: methods.length ? methods : undefined,
        });
        break;
      }
    }
  }
  return symbols;
}

function hasRsPub(node: Node): boolean {
  for (const child of node.children) {
    if (child.type === 'visibility_modifier') return true;
  }
  return false;
}

function extractJavaSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    if (child.type === 'class_declaration') {
      const methods: SymbolInfo[] = [];
      const body = child.childForFieldName('body');
      if (body) {
        for (const m of body.namedChildren) {
          if (m.type === 'method_declaration') {
            methods.push({
              name: nameOf(m, 'name'),
              kind: SymbolKind.Method,
              exported: hasJavaModifier(m, 'public'),
              line: m.startPosition.row,
              signature: extractSignature(m, source),
            });
          }
        }
      }
      symbols.push({
        name: nameOf(child, 'name'),
        kind: SymbolKind.Class,
        exported: hasJavaModifier(child, 'public'),
        line: child.startPosition.row,
        signature: extractSignature(child, source),
        children: methods.length ? methods : undefined,
      });
    } else if (child.type === 'interface_declaration') {
      symbols.push({
        name: nameOf(child, 'name'),
        kind: SymbolKind.Interface,
        exported: hasJavaModifier(child, 'public'),
        line: child.startPosition.row,
        signature: extractSignature(child, source),
      });
    } else if (child.type === 'enum_declaration') {
      symbols.push({
        name: nameOf(child, 'name'),
        kind: SymbolKind.Enum,
        exported: hasJavaModifier(child, 'public'),
        line: child.startPosition.row,
        signature: extractSignature(child, source),
      });
    }
  }
  return symbols;
}

function hasJavaModifier(node: Node, modifier: string): boolean {
  for (const child of node.children) {
    if (child.type === 'modifiers') {
      return child.text.includes(modifier);
    }
  }
  return false;
}

function extractCssSymbols(root: Node, _source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    if (child.type === 'rule_set') {
      const selectors = child.childForFieldName('selectors');
      const name = selectors?.text ?? '<rule>';
      symbols.push({
        name,
        kind: SymbolKind.CssSelector,
        exported: false,
        line: child.startPosition.row,
        signature: name,
      });
    }
  }
  return symbols;
}

function extractBashSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    if (child.type === 'function_definition') {
      symbols.push({
        name: nameOf(child, 'name'),
        kind: SymbolKind.Function,
        exported: false,
        line: child.startPosition.row,
        signature: extractSignature(child, source),
      });
    }
  }
  return symbols;
}

// ── C++ / C ────────────────────────────────────────────────────

function extractCppSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    switch (child.type) {
      case 'function_definition':
      case 'declaration': {
        const declarator = child.childForFieldName('declarator');
        const isFuncDecl = declarator?.type === 'function_declarator';
        const isPtrToFunc =
          declarator?.type === 'pointer_declarator' &&
          declarator.childForFieldName('declarator')?.type ===
            'function_declarator';
        if (isFuncDecl || isPtrToFunc) {
          const name =
            declarator.childForFieldName('declarator')?.text ?? declarator.text;
          symbols.push({
            name,
            kind: SymbolKind.Function,
            exported: false,
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
        }
        break;
      }
      case 'class_specifier':
      case 'struct_specifier': {
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Class,
          exported: false,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;
      }
      case 'enum_specifier': {
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Enum,
          exported: false,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;
      }
      case 'namespace_definition': {
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Type,
          exported: false,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;
      }
    }
  }
  return symbols;
}

function extractRubySymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  for (const child of root.namedChildren) {
    switch (child.type) {
      case 'method':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Function,
          exported: true,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;
      case 'class': {
        const methods: SymbolInfo[] = [];
        const body = child.childForFieldName('body');
        if (body) {
          for (const m of body.namedChildren) {
            if (m.type === 'method') {
              methods.push({
                name: nameOf(m, 'name'),
                kind: SymbolKind.Method,
                exported: true,
                line: m.startPosition.row,
                signature: extractSignature(m, source),
              });
            }
          }
        }
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Class,
          exported: true,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
          children: methods.length ? methods : undefined,
        });
        break;
      }
      case 'module':
        symbols.push({
          name: nameOf(child, 'name'),
          kind: SymbolKind.Type,
          exported: true,
          line: child.startPosition.row,
          signature: extractSignature(child, source),
        });
        break;
    }
  }
  return symbols;
}

// ── PHP ────────────────────────────────────────────────────────────

function extractPhpSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function visit(node: Node) {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'function_definition':
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Function,
            exported: true,
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
          break;
        case 'class_declaration':
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Class,
            exported: true,
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
          break;
        case 'interface_declaration':
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Interface,
            exported: true,
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
          break;
        case 'program':
          visit(child);
          break;
      }
    }
  }

  visit(root);
  return symbols;
}

/**
 * C# uses `modifier` (singular) per child node, unlike Java's
 * `modifiers` (plural) wrapper. Check each direct child for a
 * matching modifier keyword.
 */
function hasCsharpModifier(node: Node, modifier: string): boolean {
  for (const child of node.children) {
    if (child.type === 'modifier' && child.text.includes(modifier)) return true;
  }
  return false;
}

function extractCsharpSymbols(root: Node, source: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function visit(node: Node) {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'class_declaration': {
          const methods: SymbolInfo[] = [];
          const body = child.childForFieldName('body');
          if (body) {
            for (const m of body.namedChildren) {
              if (m.type === 'method_declaration') {
                methods.push({
                  name: nameOf(m, 'name'),
                  kind: SymbolKind.Method,
                  exported: hasCsharpModifier(m, 'public'),
                  line: m.startPosition.row,
                  signature: extractSignature(m, source),
                });
              }
            }
          }
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Class,
            exported: hasCsharpModifier(child, 'public'),
            line: child.startPosition.row,
            signature: extractSignature(child, source),
            children: methods.length ? methods : undefined,
          });
          break;
        }
        case 'interface_declaration':
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Interface,
            exported: hasCsharpModifier(child, 'public'),
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
          break;
        case 'enum_declaration':
          symbols.push({
            name: nameOf(child, 'name'),
            kind: SymbolKind.Enum,
            exported: hasCsharpModifier(child, 'public'),
            line: child.startPosition.row,
            signature: extractSignature(child, source),
          });
          break;
        case 'namespace_declaration':
          visit(child);
          break;
      }
    }
  }

  visit(root);
  return symbols;
}

const EXTRACTORS: Record<string, Extractor> = {
  'tree-sitter-typescript.wasm': extractTsSymbols,
  'tree-sitter-tsx.wasm': extractTsSymbols,
  'tree-sitter-javascript.wasm': extractTsSymbols,
  'tree-sitter-python.wasm': extractPySymbols,
  'tree-sitter-go.wasm': extractGoSymbols,
  'tree-sitter-rust.wasm': extractRsSymbols,
  'tree-sitter-java.wasm': extractJavaSymbols,
  'tree-sitter-css.wasm': extractCssSymbols,
  'tree-sitter-bash.wasm': extractBashSymbols,
  'tree-sitter-ruby.wasm': extractRubySymbols,
  'tree-sitter-php.wasm': extractPhpSymbols,
  'tree-sitter-c-sharp.wasm': extractCsharpSymbols,
  'tree-sitter-cpp.wasm': extractCppSymbols,
};

export function extractSymbols(
  rootNode: Node,
  grammarFile: string,
  sourceText: string,
): SymbolInfo[] {
  const extractor = EXTRACTORS[grammarFile];
  if (!extractor) return [];
  return extractor(rootNode, sourceText);
}

/**
 * Create a minimal wrapper that looks like a root node
 * so we can pass a subset of children to an extractor.
 */
function fakeRoot(children: Node[]): Node {
  return {
    namedChildren: children,
  } as unknown as Node;
}
