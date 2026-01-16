#!/usr/bin/env tsx
/**
 * Example Theme Extractor
 *
 * Extracts colors from VS Code theme JSON files and generates CSS variables
 * with --example-* prefix for comparison with our own theme.
 *
 * Usage:
 * 1. Paste a VS Code theme JSON into example-theme-dark.json and/or example-theme-light.json
 * 2. Run: pnpm generate:example-theme
 * 3. The script generates syntax-example-theme.css with --example-* variables
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const test = { response: 'okay' };
if (test.response === 'test') {
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Types
// =============================================================================

interface TokenColor {
  scope?: string | string[];
  settings?: {
    foreground?: string;
    fontStyle?: string;
  };
}

interface VSCodeTheme {
  type?: 'light' | 'dark';
  colors?: {
    'editor.foreground'?: string;
    'editor.background'?: string;
    [key: string]: string | undefined;
  };
  tokenColors?: TokenColor[];
}

interface ExtractedColors {
  [variableName: string]: string;
}

interface ExtractedFontStyles {
  [variableName: string]: string;
}

interface ExtractionResult {
  colors: ExtractedColors;
  fontStyles: ExtractedFontStyles;
}

// =============================================================================
// Reverse Scope Mapping
// =============================================================================

/**
 * Maps TextMate scopes to syntax variable names.
 *
 * IMPORTANT: Order matters! More SPECIFIC scopes must come FIRST.
 * This mimics TextMate/VS Code behavior where "most specific wins".
 *
 * The array is ordered:
 * 1. Specific token overrides (most specific scopes)
 * 2. General base tokens (less specific scopes)
 * 3. Fallbacks at the end
 */
const SCOPE_TO_VARIABLE: Array<{ scopes: string[]; variable: string }> = [
  // ==========================================================================
  // SPECIFIC Token Overrides (most specific - must come FIRST!)
  // ==========================================================================

  // String/Template specifics (before general string)
  {
    scopes: ['constant.character.escape'],
    variable: '--example-syntax-string-escape',
  },
  {
    scopes: [
      'punctuation.definition.template-expression.begin',
      'punctuation.definition.template-expression.end',
      'punctuation.section.embedded',
    ],
    variable: '--example-syntax-string-template-expression',
  },

  // Variable specifics (before general variable)
  {
    scopes: ['variable.other.readwrite'],
    variable: '--example-syntax-variable-readwrite',
  },
  {
    scopes: ['variable.parameter', 'variable.parameter.function'],
    variable: '--example-syntax-variable-parameter',
  },
  {
    scopes: [
      'variable.other.property',
      'variable.other.object.property',
      'meta.property.object',
      'meta.definition.property',
    ],
    variable: '--example-syntax-variable-property',
  },

  // Keyword/Operator specifics (before general keyword/operator)
  {
    scopes: ['keyword.control', 'keyword.control.flow'],
    variable: '--example-syntax-keyword-control',
  },
  {
    scopes: [
      'keyword.operator.expression.typeof',
      'keyword.operator.expression.instanceof',
      'keyword.operator.expression.delete',
      'keyword.operator.expression.in',
      'keyword.operator.expression.of',
      'keyword.operator.expression.void',
      'keyword.operator.expression.keyof',
      'keyword.operator.new',
      'keyword.operator.delete',
      'keyword.operator.typeof',
      'keyword.operator.instanceof',
      'keyword.operator.in',
      'keyword.operator.of',
    ],
    variable: '--example-syntax-keyword-operator-expression',
  },
  {
    scopes: ['keyword.operator.comparison', 'keyword.operator.relational'],
    variable: '--example-syntax-keyword-operator-comparison',
  },
  {
    scopes: ['keyword.operator.logical'],
    variable: '--example-syntax-keyword-operator-logical',
  },
  {
    scopes: [
      'keyword.operator.arithmetic',
      'keyword.operator.increment',
      'keyword.operator.decrement',
    ],
    variable: '--example-syntax-keyword-operator-arithmetic',
  },
  {
    scopes: [
      'keyword.operator.assignment',
      'keyword.operator.assignment.compound',
    ],
    variable: '--example-syntax-keyword-operator-assignment',
  },

  // Type specifics (before general type)
  {
    scopes: [
      'support.type.primitive',
      'support.type.primitive.ts',
      'support.type.builtin.ts',
      'support.type.primitive.tsx',
      'support.type.builtin.tsx',
    ],
    variable: '--example-syntax-type-primitive',
  },
  {
    scopes: ['entity.name.class', 'support.class', 'entity.name.type.class'],
    variable: '--example-syntax-type-class',
  },
  {
    scopes: ['entity.name.type.interface', 'storage.type.interface'],
    variable: '--example-syntax-type-interface',
  },

  // Web framework specifics (JS/TS/React/Vue/Angular)
  {
    scopes: [
      'support.class.component',
      'entity.name.tag.js',
      'entity.name.tag.tsx',
    ],
    variable: '--example-syntax-jsx-tag',
  },
  {
    scopes: [
      'entity.other.attribute-name.js',
      'entity.other.attribute-name.ts',
      'entity.other.attribute-name.jsx',
      'entity.other.attribute-name.tsx',
    ],
    variable: '--example-syntax-jsx-attribute',
  },
  {
    scopes: [
      'entity.name.type.module',
      'support.module.node',
      'support.type.object.module',
    ],
    variable: '--example-syntax-module',
  },
  {
    scopes: ['support.type.property-name.json'],
    variable: '--example-syntax-json-property',
  },
  {
    scopes: ['support.type.property-name.css', 'meta.property-name.css'],
    variable: '--example-syntax-css-property',
  },
  {
    scopes: ['meta.property-value.css'],
    variable: '--example-syntax-css-value',
  },
  {
    scopes: ['meta.selector', 'meta.selector.css'],
    variable: '--example-syntax-css-selector',
  },
  {
    scopes: ['keyword.other.unit', 'keyword.other.unit.css'],
    variable: '--example-syntax-css-unit',
  },

  // Regex specifics (before general string.regexp)
  {
    scopes: ['source.regexp', 'string.regexp'],
    variable: '--example-syntax-regexp',
  },
  {
    scopes: [
      'punctuation.definition.group.regexp',
      'punctuation.definition.character-class.regexp',
      'keyword.operator.quantifier.regexp',
      'keyword.operator.or.regexp',
      'keyword.control.anchor.regexp',
    ],
    variable: '--example-syntax-regexp-group',
  },

  // Additional specific tokens
  {
    scopes: ['storage', 'storage.type', 'storage.modifier'],
    variable: '--example-syntax-storage',
  },
  {
    scopes: ['entity.name.tag.html'],
    variable: '--example-syntax-html-tag',
  },
  {
    scopes: ['variable.other.constant'],
    variable: '--example-syntax-variable-constant',
  },
  {
    scopes: ['entity.other.inherited-class'],
    variable: '--example-syntax-class-inherited',
  },
  {
    scopes: [
      'entity.other.attribute-name.class.css',
      'entity.other.attribute-name.class',
    ],
    variable: '--example-syntax-css-class',
  },
  {
    scopes: [
      'punctuation.section.embedded.begin',
      'punctuation.section.embedded.end',
    ],
    variable: '--example-syntax-embedded-punctuation',
  },

  // ==========================================================================
  // GENERAL Base Tokens (less specific - after specific overrides)
  // ==========================================================================

  // 1) Errors / invalid (high priority)
  {
    scopes: ['invalid', 'invalid.illegal', 'markup.error'],
    variable: '--example-syntax-error',
  },

  // 2) Comments
  {
    scopes: ['comment', 'punctuation.definition.comment'],
    variable: '--example-syntax-comment',
  },

  // 3) Keywords & language structure
  {
    scopes: [
      'keyword',
      'keyword.other',
      'storage.type',
      'storage.modifier',
      'keyword.control.import',
      'keyword.control.export',
      'keyword.control.from',
    ],
    variable: '--example-syntax-keyword',
  },
  {
    scopes: ['keyword.operator'],
    variable: '--example-syntax-operator',
  },
  {
    scopes: ['variable.language'],
    variable: '--example-syntax-language-variable',
  },

  // 4) Functions, methods, calls
  {
    scopes: [
      'entity.name.function',
      'support.function',
      'meta.function-call',
      'variable.function',
      'entity.name.method',
      'support.method',
    ],
    variable: '--example-syntax-function',
  },

  // 5) Types, classes, interfaces, enums (general)
  {
    scopes: [
      'entity.name.type',
      'support.type',
      'storage.type.class',
      'storage.type.struct',
      'storage.type.enum',
      'entity.name.interface',
      'support.interface',
      'entity.name.enum',
      'support.enum',
    ],
    variable: '--example-syntax-type',
  },
  {
    scopes: [
      'variable.other.enummember',
      'constant.other.enummember',
      'entity.name.constant.enum-member',
    ],
    variable: '--example-syntax-constant',
  },

  // 6) Decorators / annotations / directives
  {
    scopes: [
      'meta.decorator',
      'meta.annotation',
      'entity.name.function.decorator',
      'punctuation.definition.decorator',
    ],
    variable: '--example-syntax-decorator',
  },
  {
    scopes: [
      'keyword.directive',
      'keyword.control.directive',
      'meta.preprocessor',
      'entity.name.directive',
      'support.directive',
    ],
    variable: '--example-syntax-directive',
  },

  // 7) Namespaces, modules, references
  {
    scopes: [
      'entity.name.namespace',
      'support.namespace',
      'meta.namespace',
      'entity.name.module',
      'support.module',
    ],
    variable: '--example-syntax-namespace',
  },
  {
    scopes: [
      'storage.modifier.pointer',
      'storage.modifier.reference',
      'storage.modifier.lifetime',
      'keyword.other.reference',
    ],
    variable: '--example-syntax-reference-modifier',
  },

  // 8) Properties, attributes, members (general)
  {
    scopes: [
      'variable.object.property',
      'meta.member.access',
      'meta.property-name',
      'support.variable.property',
      'entity.other.attribute-name',
      'support.type.property-name',
    ],
    variable: '--example-syntax-property',
  },

  // 9) Variables / identifiers (fallback)
  {
    scopes: ['variable', 'meta.definition.variable.name', 'identifier'],
    variable: '--example-syntax-text',
  },

  // 10) Strings & templates (general - after specific string overrides)
  {
    scopes: [
      'string',
      'string.quoted',
      'string.template',
      'punctuation.definition.string',
      'constant.character',
    ],
    variable: '--example-syntax-string',
  },

  // 11) Numbers, units
  {
    scopes: [
      'constant.numeric',
      'constant.numeric.integer',
      'constant.numeric.float',
      'constant.numeric.hex',
      'constant.numeric.unit',
      'meta.unit',
    ],
    variable: '--example-syntax-number',
  },

  // 12) Constants, booleans, JSON values
  {
    scopes: [
      'constant.language',
      'constant.other',
      'entity.name.constant',
      'support.constant',
      'constant.other.color',
      'support.constant.color',
    ],
    variable: '--example-syntax-constant',
  },

  // 13) Punctuation, delimiters, brackets
  {
    scopes: [
      'punctuation',
      'meta.brace',
      'meta.delimiter',
      'punctuation.separator',
      'punctuation.terminator',
    ],
    variable: '--example-syntax-punctuation',
  },

  // 14) Markup / HTML / JSX / Markdown - Tags
  {
    scopes: ['entity.name.tag', 'meta.tag'],
    variable: '--example-syntax-tag',
  },
  {
    scopes: [
      'punctuation.definition.tag',
      'punctuation.definition.tag.begin',
      'punctuation.definition.tag.end',
    ],
    variable: '--example-syntax-tag-punctuation',
  },
  {
    scopes: [
      'meta.tag.metadata',
      'meta.tag.sgml.doctype',
      'entity.other.attribute-name.id',
      'entity.other.attribute-name.class',
    ],
    variable: '--example-syntax-meta',
  },

  // 15) Markup formatting
  {
    scopes: [
      'markup.bold',
      'markup.heading',
      'markup.inline.raw',
      'markup.fenced_code',
    ],
    variable: '--example-syntax-constant',
  },
  {
    scopes: ['markup.underline.link', 'markup.link', 'string.other.link'],
    variable: '--example-syntax-property',
  },

  // 16) Diff
  {
    scopes: [
      'meta.diff.header',
      'meta.diff.range',
      'punctuation.definition.from-file',
      'punctuation.definition.to-file',
    ],
    variable: '--example-syntax-property',
  },
  {
    scopes: ['markup.inserted', 'meta.diff.range.inserted'],
    variable: '--example-syntax-string',
  },
  {
    scopes: ['markup.deleted', 'meta.diff.range.deleted'],
    variable: '--example-syntax-error',
  },
  {
    scopes: ['markup.changed', 'meta.diff.range.changed'],
    variable: '--example-syntax-constant',
  },

  // 17) Fallback / default text
  {
    scopes: ['source', 'text'],
    variable: '--example-syntax-text',
  },
];

/**
 * All syntax COLOR variables in order for CSS output
 */
const ALL_SYNTAX_VARIABLES = [
  // Base tokens
  '--example-syntax-editor-foreground',
  '--example-syntax-editor-background',
  // Bracket highlight colors (variable count, up to 6)
  '--example-syntax-bracket-highlight-foreground1',
  '--example-syntax-bracket-highlight-foreground2',
  '--example-syntax-bracket-highlight-foreground3',
  '--example-syntax-bracket-highlight-foreground4',
  '--example-syntax-bracket-highlight-foreground5',
  '--example-syntax-bracket-highlight-foreground6',
  '--example-syntax-text',
  '--example-syntax-punctuation',
  '--example-syntax-operator',
  '--example-syntax-comment',
  '--example-syntax-keyword',
  '--example-syntax-function',
  '--example-syntax-type',
  '--example-syntax-decorator',
  '--example-syntax-namespace',
  '--example-syntax-reference-modifier',
  '--example-syntax-property',
  '--example-syntax-language-variable',
  '--example-syntax-string',
  '--example-syntax-number',
  '--example-syntax-constant',
  '--example-syntax-directive',
  '--example-syntax-tag',
  '--example-syntax-tag-punctuation',
  '--example-syntax-meta',
  '--example-syntax-error',
  // Specific token overrides (web/node focused)
  '--example-syntax-variable-readwrite',
  '--example-syntax-variable-parameter',
  '--example-syntax-variable-property',
  '--example-syntax-keyword-control',
  '--example-syntax-keyword-operator-expression',
  '--example-syntax-keyword-operator-comparison',
  '--example-syntax-keyword-operator-logical',
  '--example-syntax-keyword-operator-arithmetic',
  '--example-syntax-keyword-operator-assignment',
  '--example-syntax-type-primitive',
  '--example-syntax-type-class',
  '--example-syntax-type-interface',
  '--example-syntax-string-template-expression',
  '--example-syntax-string-escape',
  '--example-syntax-jsx-tag',
  '--example-syntax-jsx-attribute',
  '--example-syntax-module',
  '--example-syntax-json-property',
  '--example-syntax-css-property',
  '--example-syntax-css-value',
  '--example-syntax-css-selector',
  '--example-syntax-css-unit',
  '--example-syntax-regexp',
  '--example-syntax-regexp-group',
  // Additional specific tokens
  '--example-syntax-storage',
  '--example-syntax-html-tag',
  '--example-syntax-variable-constant',
  '--example-syntax-class-inherited',
  '--example-syntax-css-class',
  '--example-syntax-embedded-punctuation',
];

/**
 * FontStyle variables that can be extracted
 * These map to the base color variable with -style suffix
 */
const FONT_STYLE_VARIABLES = [
  '--example-syntax-comment-style',
  '--example-syntax-language-variable-style',
  '--example-syntax-variable-parameter-style',
  '--example-syntax-jsx-attribute-style',
];

// =============================================================================
// Theme JSON Parsing
// =============================================================================

/**
 * Parse a VS Code theme JSON file
 */
function parseThemeJSON(filePath: string): VSCodeTheme | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Check if it's an empty object
    if (Object.keys(parsed).length === 0) {
      console.log(`⚠️  ${path.basename(filePath)} is empty, skipping...`);
      return null;
    }

    return parsed as VSCodeTheme;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

// =============================================================================
// Color Extraction
// =============================================================================

/**
 * Find the syntax variable for a given scope
 */
function _findVariableForScope(scope: string): string | null {
  const result = findVariableForScopeWithExactness(scope);
  return result.variable;
}

/**
 * Find the syntax variable for a given scope, also returning whether it was an exact match
 */
function findVariableForScopeWithExactness(scope: string): {
  variable: string | null;
  isExact: boolean;
} {
  // First try exact match
  for (const mapping of SCOPE_TO_VARIABLE) {
    if (mapping.scopes.includes(scope)) {
      return { variable: mapping.variable, isExact: true };
    }
  }

  // Then try prefix match (e.g., "comment.line" should match "comment")
  for (const mapping of SCOPE_TO_VARIABLE) {
    for (const mappedScope of mapping.scopes) {
      if (scope.startsWith(`${mappedScope}.`) || scope === mappedScope) {
        return { variable: mapping.variable, isExact: false };
      }
    }
  }

  return { variable: null, isExact: false };
}

/**
 * Extract colors and fontStyles from a theme, mapping scopes to syntax variables
 *
 * Strategy: We ONLY use exact matches. If a theme defines `keyword.control.xi`
 * but not `keyword.control`, we don't use the xi-specific color for our
 * `--example-syntax-keyword-control` variable. The theme relies on its generic
 * `keyword` fallback for that case, and so should we (by outputting `none`).
 *
 * This prevents language-specific overrides (like Xi, Python, C++) from
 * incorrectly being treated as the "general" definition for a scope.
 */
function extractColorsAndStyles(theme: VSCodeTheme): ExtractionResult {
  const colors: ExtractedColors = {};
  const fontStyles: ExtractedFontStyles = {};
  const unmappedScopes: string[] = [];

  // Track exact matches only
  const colorMatches: Map<string, string> = new Map();
  const fontStyleMatches: Map<string, string> = new Map();

  // Extract editor colors
  if (theme.colors?.['editor.foreground']) {
    colors['--example-syntax-editor-foreground'] =
      theme.colors['editor.foreground'];
  }
  if (theme.colors?.['editor.background']) {
    colors['--example-syntax-editor-background'] =
      theme.colors['editor.background'];
  }

  // Extract bracket highlight colors (variable length)
  for (let i = 1; i <= 6; i++) {
    const colorKey = `editorBracketHighlight.foreground${i}`;
    if (theme.colors?.[colorKey]) {
      colors[`--example-syntax-bracket-highlight-foreground${i}`] =
        theme.colors[colorKey];
    }
  }

  // Extract token colors and fontStyles
  if (theme.tokenColors) {
    for (const token of theme.tokenColors) {
      // Skip tokens with no scope
      if (!token.scope) continue;

      // Skip tokens with neither foreground nor fontStyle
      if (!token.settings?.foreground && !token.settings?.fontStyle) continue;

      const scopes = Array.isArray(token.scope)
        ? token.scope
        : token.scope.split(',').map((s) => s.trim());

      for (const scope of scopes) {
        const { variable, isExact } = findVariableForScopeWithExactness(scope);

        if (variable) {
          // ONLY use exact matches - skip prefix matches entirely
          // This prevents language-specific scopes like `keyword.control.xi`
          // from being incorrectly used for our `keyword-control` variable
          if (!isExact) {
            continue;
          }

          // For colors: first exact match wins (order in theme matters)
          if (token.settings?.foreground && !colorMatches.has(variable)) {
            colorMatches.set(variable, token.settings.foreground);
          }

          // For fontStyles: same logic
          const fontStyleVar = `${variable}-style`;
          if (
            token.settings?.fontStyle &&
            !fontStyleMatches.has(fontStyleVar)
          ) {
            fontStyleMatches.set(fontStyleVar, token.settings.fontStyle);
          }
        } else {
          if (!unmappedScopes.includes(scope)) {
            unmappedScopes.push(scope);
          }
        }
      }
    }
  }

  // Convert matches to final colors/fontStyles
  for (const [variable, value] of colorMatches) {
    colors[variable] = value;
  }
  for (const [variable, value] of fontStyleMatches) {
    fontStyles[variable] = value;
  }

  // Log unmapped scopes for debugging
  if (unmappedScopes.length > 0) {
    console.log('\n📋 Unmapped scopes (no matching syntax variable):');
    for (const scope of unmappedScopes.slice(0, 20)) {
      console.log(`   - ${scope}`);
    }
    if (unmappedScopes.length > 20) {
      console.log(`   ... and ${unmappedScopes.length - 20} more`);
    }
  }

  return { colors, fontStyles };
}

// =============================================================================
// CSS Generation
// =============================================================================

/**
 * Generate CSS variable declarations for colors and fontStyles
 * Variables not found in the theme are set to 'none' so they:
 * 1. Override light mode values in dark mode (no CSS cascade issues)
 * 2. Can be detected and displayed appropriately in Colors.stories.tsx
 * 3. Are consistent with how users define undefined tokens in syntax.css
 */
function extractVarsFromExampleTheme(
  colors: ExtractedColors,
  fontStyles: ExtractedFontStyles,
  indent: string,
): string {
  const lines: string[] = [];

  // Color variables
  for (const variable of ALL_SYNTAX_VARIABLES) {
    const color = colors[variable];
    if (color) {
      lines.push(`${indent}${variable}: ${color};`);
    } else {
      lines.push(`${indent}${variable}: none; /* not defined in theme */`);
    }
  }

  // FontStyle variables
  lines.push(`${indent}/* Font styles */`);
  for (const variable of FONT_STYLE_VARIABLES) {
    const style = fontStyles[variable];
    if (style) {
      lines.push(`${indent}${variable}: ${style};`);
    } else {
      lines.push(`${indent}${variable}: none; /* not defined in theme */`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate the complete CSS file content
 */
function generateCSS(
  lightResult: ExtractionResult | null,
  darkResult: ExtractionResult | null,
): string {
  const lines: string[] = [];

  lines.push(
    '/* ==========================================================================',
  );
  lines.push(
    '   Example Theme Variables - Auto-generated from VS Code theme JSON',
  );
  lines.push('   Generated by: pnpm generate:example-theme');
  lines.push(
    '   ========================================================================== */',
  );
  lines.push('');

  // Light mode
  lines.push(
    '/* --------------------------------------------------------------------------',
  );
  lines.push('   Light mode');
  lines.push(
    '   -------------------------------------------------------------------------- */',
  );

  if (lightResult && Object.keys(lightResult.colors).length > 0) {
    lines.push('@theme default {');
    lines.push(
      extractVarsFromExampleTheme(
        lightResult.colors,
        lightResult.fontStyles,
        '  ',
      ),
    );
    lines.push('}');
  } else {
    lines.push(
      '/* No light theme provided - using dark theme values as fallback */',
    );
    if (darkResult) {
      lines.push('@theme default {');
      lines.push(
        extractVarsFromExampleTheme(
          darkResult.colors,
          darkResult.fontStyles,
          '  ',
        ),
      );
      lines.push('}');
    }
  }

  lines.push('');

  // Dark mode
  lines.push(
    '/* --------------------------------------------------------------------------',
  );
  lines.push('   Dark mode');
  lines.push(
    '   -------------------------------------------------------------------------- */',
  );

  if (darkResult && Object.keys(darkResult.colors).length > 0) {
    lines.push('@media (prefers-color-scheme: dark) {');
    lines.push('  :root {');
    lines.push(
      extractVarsFromExampleTheme(
        darkResult.colors,
        darkResult.fontStyles,
        '    ',
      ),
    );
    lines.push('  }');
    lines.push('}');
  } else {
    lines.push(
      '/* No dark theme provided - using light theme values as fallback */',
    );
    if (lightResult) {
      lines.push('@media (prefers-color-scheme: dark) {');
      lines.push('  :root {');
      lines.push(
        extractVarsFromExampleTheme(
          lightResult.colors,
          lightResult.fontStyles,
          '    ',
        ),
      );
      lines.push('  }');
      lines.push('}');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  console.log('🎨 Example Theme Extractor\n');

  const lightThemePath = path.join(__dirname, 'example-theme-light.json');
  const darkThemePath = path.join(__dirname, 'example-theme-dark.json');
  const outputPath = path.join(
    __dirname,
    '../styles/code-block-syntax-example.css',
  );

  // Parse themes
  console.log('📖 Reading theme files...');
  const lightTheme = parseThemeJSON(lightThemePath);
  const darkTheme = parseThemeJSON(darkThemePath);

  if (!lightTheme && !darkTheme) {
    console.error('\n❌ No valid theme files found. Please add theme JSON to:');
    console.error(`   - ${lightThemePath}`);
    console.error(`   - ${darkThemePath}`);
    process.exit(1);
  }

  // Extract colors and fontStyles
  let lightResult: ExtractionResult | null = null;
  let darkResult: ExtractionResult | null = null;

  if (lightTheme) {
    console.log('\n🔍 Extracting light theme colors and styles...');
    lightResult = extractColorsAndStyles(lightTheme);
    console.log(
      `   Found ${Object.keys(lightResult.colors).length} color variables`,
    );
    console.log(
      `   Found ${Object.keys(lightResult.fontStyles).length} fontStyle variables`,
    );
  }

  if (darkTheme) {
    console.log('\n🔍 Extracting dark theme colors and styles...');
    darkResult = extractColorsAndStyles(darkTheme);
    console.log(
      `   Found ${Object.keys(darkResult.colors).length} color variables`,
    );
    console.log(
      `   Found ${Object.keys(darkResult.fontStyles).length} fontStyle variables`,
    );
  }

  // Generate CSS
  console.log('\n📝 Generating CSS...');
  const css = generateCSS(lightResult, darkResult);

  // Write output
  fs.writeFileSync(outputPath, css);
  console.log(`\n✅ Generated: ${outputPath}`);

  // Summary
  console.log('\n📊 Summary:');
  if (lightResult) {
    console.log('\n   Light theme colors:');
    for (const [name, color] of Object.entries(lightResult.colors)) {
      console.log(`     ${name}: ${color}`);
    }
    if (Object.keys(lightResult.fontStyles).length > 0) {
      console.log('\n   Light theme fontStyles:');
      for (const [name, style] of Object.entries(lightResult.fontStyles)) {
        console.log(`     ${name}: ${style}`);
      }
    }
  }
  if (darkResult) {
    console.log('\n   Dark theme colors:');
    for (const [name, color] of Object.entries(darkResult.colors)) {
      console.log(`     ${name}: ${color}`);
    }
    if (Object.keys(darkResult.fontStyles).length > 0) {
      console.log('\n   Dark theme fontStyles:');
      for (const [name, style] of Object.entries(darkResult.fontStyles)) {
        console.log(`     ${name}: ${style}`);
      }
    }
  }
}

main();
