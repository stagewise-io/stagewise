#!/usr/bin/env tsx
/**
 * Theme JSON Generator
 *
 * Generates VS Code-compatible theme JSON files by:
 * 1. Parsing CSS color definitions from palette.css, theme.css, and syntax.css
 * 2. Resolving CSS variable references
 * 3. Converting OKLCH colors to hex
 * 4. Mapping TextMate scopes to syntax variables
 * 5. Outputting dark and light theme JSON files
 */

import { formatHex, parse } from 'culori';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Types
// =============================================================================

interface ColorVariables {
  [key: string]: string;
}

interface ThemeColors {
  light: ColorVariables;
  dark: ColorVariables;
}

interface TokenColor {
  scope: string | string[];
  settings: {
    foreground?: string;
    fontStyle?: string;
  };
}

interface VSCodeTheme {
  $schema: string;
  name: string;
  type: 'light' | 'dark';
  colors: {
    'editor.foreground': string;
    'editor.background': string;
    [key: string]: string;
  };
  tokenColors: TokenColor[];
}

// =============================================================================
// CSS Parsing
// =============================================================================

/**
 * Parse CSS content and extract variable declarations from @theme default blocks
 */
function parseThemeDefaultBlock(css: string): ColorVariables {
  const vars: ColorVariables = {};

  // Match @theme default { ... } blocks
  const themeBlockRegex = /@theme\s+default\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
  const matches = css.matchAll(themeBlockRegex);

  for (const match of matches) {
    const blockContent = match[1] ?? '';
    extractVariables(blockContent, vars);
  }

  return vars;
}

/**
 * Parse CSS content and extract variable declarations from @media (prefers-color-scheme: dark) blocks
 */
function parseDarkModeBlock(css: string): ColorVariables {
  const vars: ColorVariables = {};

  // Match @media (prefers-color-scheme: dark) { :root { ... } } blocks
  const darkBlockRegex =
    /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*?:root\s*\{([^}]+)\}/g;
  const matches = css.matchAll(darkBlockRegex);

  for (const match of matches) {
    const blockContent = match[1] ?? '';
    extractVariables(blockContent, vars);
  }

  return vars;
}

/**
 * Extract CSS variable declarations from a block of CSS
 */
function extractVariables(css: string, vars: ColorVariables): void {
  // Match --variable-name: value; patterns
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  const matches = css.matchAll(varRegex);

  for (const match of matches) {
    const varName = match[1] ?? '';
    const value = match[2]?.trim() ?? '';
    vars[varName] = value;
  }
}

/**
 * Parse all CSS files and return light/dark color maps
 */
function parseCSSFiles(): ThemeColors {
  const palettePath = path.join(__dirname, '../palette.css');
  const themePath = path.join(__dirname, '../theme.css');
  const syntaxPath = path.join(__dirname, 'syntax.css');

  const paletteCss = fs.readFileSync(palettePath, 'utf-8');
  const themeCss = fs.readFileSync(themePath, 'utf-8');
  const syntaxCss = fs.readFileSync(syntaxPath, 'utf-8');

  // Parse light mode (from @theme default blocks)
  const paletteLight = parseThemeDefaultBlock(paletteCss);
  const themeLight = parseThemeDefaultBlock(themeCss);
  const syntaxLight = parseThemeDefaultBlock(syntaxCss);

  // Parse dark mode (from @media blocks)
  const paletteDark = parseThemeDefaultBlock(paletteCss); // Palette is shared
  const themeDark = parseDarkModeBlock(themeCss);
  const syntaxDark = parseDarkModeBlock(syntaxCss);

  return {
    light: { ...paletteLight, ...themeLight, ...syntaxLight },
    dark: { ...paletteLight, ...paletteDark, ...themeDark, ...syntaxDark },
  };
}

// =============================================================================
// Variable Resolution
// =============================================================================

/**
 * Variable aliases for missing or renamed variables
 * These provide backwards compatibility if CSS files still use old names
 */
const VARIABLE_ALIASES: Record<string, string> = {
  // Danger is alias for error (legacy naming)
  '--color-danger-foreground': '--color-error-foreground',
  // Info numbered scales don't exist - map to closest equivalents (legacy)
  '--color-info-600': '--color-info-foreground-light',
  '--color-info-400': '--color-info-foreground-dark',
};

/**
 * Resolve a single variable reference (e.g., "--H-green" -> "152")
 * Returns the raw value without further expansion
 */
function getVariableValue(
  varName: string,
  vars: ColorVariables,
  visited: Set<string>,
): string {
  // Prevent infinite loops
  if (visited.has(varName)) {
    console.warn(`Circular reference detected for ${varName}`);
    return '';
  }

  const value = vars[varName];

  // Check for aliases if variable not found
  if (!value && VARIABLE_ALIASES[varName]) {
    return getVariableValue(VARIABLE_ALIASES[varName], vars, visited);
  }

  if (!value) {
    console.warn(`Variable ${varName} not found`);
    return '';
  }

  return value;
}

/**
 * Resolve a CSS variable value by following the reference chain
 * and substituting all var() references within the value
 */
function resolveVariable(
  varName: string,
  vars: ColorVariables,
  visited: Set<string> = new Set(),
): string {
  // Prevent infinite loops
  if (visited.has(varName)) {
    console.warn(`Circular reference detected for ${varName}`);
    return '';
  }
  visited.add(varName);

  let value = vars[varName];

  // Check for aliases if variable not found
  if (!value && VARIABLE_ALIASES[varName])
    return resolveVariable(VARIABLE_ALIASES[varName], vars, visited);

  if (!value) {
    console.warn(`Variable ${varName} not found`);
    return '';
  }

  // Check if the ENTIRE value is a single var() reference
  // This matches values like "var(--color-foreground)"
  const fullVarRefRegex = /^\s*var\((--[\w-]+)\)\s*$/;
  const fullMatch = value.match(fullVarRefRegex);

  if (fullMatch) {
    // Recursively resolve the referenced variable
    return resolveVariable(fullMatch[1] ?? '', vars, visited);
  }

  // Substitute ALL var() references within the value
  // This handles cases like: oklch(var(--syntax-L-dark) var(--syntax-C-dark) var(--H-green))
  const varRefRegex = /var\((--[\w-]+)\)/g;
  let hasVarRefs = varRefRegex.test(value);

  // Reset regex state
  varRefRegex.lastIndex = 0;

  // Keep substituting until no more var() references remain
  let iterations = 0;
  const maxIterations = 10; // Safety limit

  while (hasVarRefs && iterations < maxIterations) {
    iterations++;

    value = value.replace(varRefRegex, (_match, refVarName: string) => {
      // Get the value of the referenced variable (without adding to visited set
      // since we're doing inline substitution, not following a chain)
      const refValue = getVariableValue(refVarName, vars, new Set());
      return refValue || '';
    });

    // Check if there are still var() references (could be nested)
    varRefRegex.lastIndex = 0;
    hasVarRefs = varRefRegex.test(value);
    varRefRegex.lastIndex = 0;
  }

  if (iterations >= maxIterations) {
    console.warn(
      `Max iterations reached resolving ${varName}, possible circular reference`,
    );
  }

  return value;
}

/**
 * Utility variables that are not actual syntax tokens (used for building colors)
 * These should not be included in the theme output
 */
const SYNTAX_UTILITY_VARS = new Set([
  '--syntax-L-dark',
  '--syntax-C-dark',
  '--syntax-L-light',
  '--syntax-C-light',
]);

/**
 * Check if a variable is a fontStyle variable (ends with -style)
 */
function isFontStyleVar(varName: string): boolean {
  return varName.endsWith('-style');
}

/**
 * Resolve all syntax COLOR variables to their final OKLCH/color values
 * (excludes fontStyle variables)
 */
function resolveSyntaxVariables(vars: ColorVariables): ColorVariables {
  const resolved: ColorVariables = {};
  const syntaxVars = Object.keys(vars).filter(
    (k) =>
      k.startsWith('--syntax-') &&
      !SYNTAX_UTILITY_VARS.has(k) &&
      !isFontStyleVar(k),
  );

  for (const varName of syntaxVars)
    resolved[varName] = resolveVariable(varName, vars);

  return resolved;
}

/**
 * Extract fontStyle variables (those ending with -style)
 * Returns a map from the base variable name to the fontStyle value
 * e.g., '--syntax-comment-style: italic' -> { '--syntax-comment': 'italic' }
 */
function extractFontStyles(vars: ColorVariables): ColorVariables {
  const fontStyles: ColorVariables = {};

  for (const [varName, value] of Object.entries(vars)) {
    if (varName.startsWith('--syntax-') && isFontStyleVar(varName)) {
      // Remove '-style' suffix to get the base variable name
      const baseVarName = varName.replace(/-style$/, '');
      fontStyles[baseVarName] = value;
    }
  }

  return fontStyles;
}

// =============================================================================
// OKLCH to Hex Conversion
// =============================================================================

/**
 * Convert an OKLCH color string to hex
 */
function oklchToHex(oklchString: string): string {
  // Parse oklch(L C H) format - handle various spacing patterns
  const match = oklchString.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
  );
  if (!match) {
    // Try to parse as any color format culori supports
    const parsed = parse(oklchString);
    if (parsed) {
      const hex = formatHex(parsed);
      return hex || '#000000';
    }
    console.warn(`Could not parse color: ${oklchString}`);
    return '#000000';
  }

  const l = Number.parseFloat(match[1] ?? '0');
  const c = Number.parseFloat(match[2] ?? '0');
  const h = Number.parseFloat(match[3] ?? '0');

  // Use culori to convert OKLCH to hex
  // culori expects l in 0-1 range, which our values already are
  const hex = formatHex({ mode: 'oklch', l, c, h });
  return hex || '#000000';
}

/**
 * Convert all resolved syntax variables to hex colors
 * Variables with value 'none' are skipped (not added to output)
 */
function convertToHex(resolvedVars: ColorVariables): ColorVariables {
  const hexVars: ColorVariables = {};

  for (const [varName, value] of Object.entries(resolvedVars)) {
    // Skip 'none' values - these should not be added to the theme
    // This allows intentionally undefined tokens to use TextMate fallback
    if (value === 'none') continue;

    if (value === 'transparent') hexVars[varName] = '#00000000';
    else if (value.startsWith('oklch')) hexVars[varName] = oklchToHex(value);
    else if (value.startsWith('#')) hexVars[varName] = value;
    else {
      // Try to parse any color format
      const parsed = parse(value);
      if (parsed) hexVars[varName] = formatHex(parsed) || '#000000';
      else {
        console.warn(`Unknown color format for ${varName}: ${value}`);
        hexVars[varName] = '#000000';
      }
    }
  }

  return hexVars;
}

// =============================================================================
// TextMate Scope Mapping
// =============================================================================

/**
 * Mapping from syntax variables to TextMate scopes
 * Based on the provided mapping table with precedence ordering
 *
 * @param hexVars - Color variables (hex values)
 * @param fontStyles - FontStyle variables (maps base var name to fontStyle)
 */
function buildTokenColors(
  hexVars: ColorVariables,
  fontStyles: ColorVariables,
): TokenColor[] {
  const tokenColors: TokenColor[] = [];

  // Helper to add a token color entry
  // fontStyle is automatically looked up from fontStyles map if not explicitly provided
  const addToken = (
    scopes: string | string[],
    syntaxVar: string,
    fontStyleOverride?: string,
  ) => {
    const color = hexVars[syntaxVar];
    if (!color) {
      console.warn(`Missing color for ${syntaxVar}`);
      return;
    }

    const settings: TokenColor['settings'] = { foreground: color };

    // Use override if provided, otherwise look up from fontStyles map
    const fontStyle = fontStyleOverride ?? fontStyles[syntaxVar];
    if (fontStyle && fontStyle !== 'normal') {
      settings.fontStyle = fontStyle;
    }

    tokenColors.push({
      scope: scopes,
      settings,
    });
  };

  // =========================================================================
  // 1) Errors / invalid (highest priority)
  // =========================================================================
  addToken(['invalid', 'invalid.illegal', 'markup.error'], '--syntax-error');

  // =========================================================================
  // 2) Comments (fontStyle from CSS variable)
  // =========================================================================
  addToken(['comment', 'punctuation.definition.comment'], '--syntax-comment');

  // =========================================================================
  // 3) Keywords & language structure
  // =========================================================================
  addToken(
    [
      'keyword',
      'keyword.control',
      'keyword.other',
      'storage.type',
      'storage.modifier',
    ],
    '--syntax-keyword',
  );

  addToken(
    [
      'keyword.operator',
      'keyword.operator.assignment',
      'keyword.operator.comparison',
      'keyword.operator.logical',
      'keyword.operator.arithmetic',
    ],
    '--syntax-operator',
  );

  addToken(['variable.language'], '--syntax-language-variable');

  addToken(
    [
      'keyword.control.import',
      'keyword.control.export',
      'keyword.control.from',
    ],
    '--syntax-keyword',
  );

  // =========================================================================
  // 4) Functions, methods, calls
  // =========================================================================
  addToken(
    [
      'entity.name.function',
      'support.function',
      'meta.function-call',
      'variable.function',
      'entity.name.method',
      'support.method',
    ],
    '--syntax-function',
  );

  // =========================================================================
  // 5) Types, classes, interfaces, enums
  // NOTE: storage.type.class/interface/struct/enum are the KEYWORDS (class, interface, etc.)
  // They should NOT be here - they fall back to the generic 'storage' token (cyan).
  // The entity.name.* scopes are the TYPE NAMES (Config, MyClass, etc.) which are orange.
  // =========================================================================
  addToken(
    [
      'entity.name.type',
      'support.type',
      'entity.name.class',
      'support.class',
      'entity.name.interface',
      'support.interface',
      'entity.name.enum',
      'support.enum',
    ],
    '--syntax-type',
  );

  addToken(
    [
      'variable.other.enummember',
      'constant.other.enummember',
      'entity.name.constant.enum-member',
    ],
    '--syntax-constant',
  );

  // =========================================================================
  // 6) Decorators / annotations / directives
  // =========================================================================
  addToken(
    [
      'meta.decorator',
      'meta.annotation',
      'entity.name.function.decorator',
      'punctuation.definition.decorator',
    ],
    '--syntax-decorator',
  );

  addToken(
    [
      'keyword.directive',
      'keyword.control.directive',
      'meta.preprocessor',
      'entity.name.directive',
      'support.directive',
    ],
    '--syntax-directive',
  );

  // =========================================================================
  // 7) Namespaces, modules, references
  // =========================================================================
  addToken(
    [
      'entity.name.namespace',
      'support.namespace',
      'meta.namespace',
      'entity.name.module',
      'support.module',
    ],
    '--syntax-namespace',
  );

  addToken(
    [
      'storage.modifier.pointer',
      'storage.modifier.reference',
      'storage.modifier.lifetime',
      'keyword.other.unit',
      'keyword.other.reference',
    ],
    '--syntax-reference-modifier',
  );

  // =========================================================================
  // 8) Properties, attributes, members
  // =========================================================================
  addToken(
    [
      'variable.other.property',
      'variable.object.property',
      'meta.member.access',
      'meta.property-name',
      'support.variable.property',
      'entity.other.attribute-name',
      'support.type.property-name.css',
      'meta.property-name.css',
      'support.type.property-name',
    ],
    '--syntax-property',
  );

  // =========================================================================
  // 9) Variables / identifiers (fallback)
  // =========================================================================
  addToken(
    ['variable', 'meta.definition.variable.name', 'identifier'],
    '--syntax-text',
  );

  // =========================================================================
  // 10) Strings & templates
  // =========================================================================
  addToken(
    [
      'string',
      'string.quoted',
      'string.template',
      'punctuation.definition.string',
      'constant.character.escape',
      'constant.character',
    ],
    '--syntax-string',
  );

  // =========================================================================
  // 11) Numbers, units, regex
  // =========================================================================
  addToken(
    [
      'constant.numeric',
      'constant.numeric.integer',
      'constant.numeric.float',
      'constant.numeric.hex',
      'constant.numeric.unit',
      'meta.unit',
    ],
    '--syntax-number',
  );

  addToken(['string.regexp', 'constant.regexp'], '--syntax-string');

  // =========================================================================
  // 12) Constants, booleans, JSON values
  // =========================================================================
  addToken(
    [
      'constant.language',
      'constant.other',
      'entity.name.constant',
      'support.constant',
      'constant.other.color',
      'support.constant.color',
    ],
    '--syntax-constant',
  );

  // =========================================================================
  // 13) Punctuation, delimiters, brackets
  // =========================================================================
  addToken(
    [
      'punctuation',
      'meta.brace',
      'meta.delimiter',
      'punctuation.separator',
      'punctuation.terminator',
    ],
    '--syntax-punctuation',
  );

  // =========================================================================
  // 14) Markup / HTML / JSX / Markdown
  // =========================================================================
  addToken(
    ['entity.name.tag', 'support.class.component', 'meta.tag'],
    '--syntax-tag',
  );

  addToken(
    [
      'punctuation.definition.tag',
      'punctuation.definition.tag.begin',
      'punctuation.definition.tag.end',
    ],
    '--syntax-tag-punctuation',
  );

  // HTML/JSX attribute `=` should be foreground, not tag color
  addToken(['punctuation.separator.key-value'], '--syntax-text');

  addToken(
    [
      'meta.tag.metadata',
      'meta.tag.sgml.doctype',
      'entity.other.attribute-name.id',
      'entity.other.attribute-name.class',
    ],
    '--syntax-meta',
  );

  addToken(
    [
      'markup.bold',
      'markup.heading',
      'markup.inline.raw',
      'markup.fenced_code',
    ],
    '--syntax-constant',
  );

  addToken(
    ['markup.underline.link', 'markup.link', 'string.other.link'],
    '--syntax-property',
  );

  // =========================================================================
  // 15) Diff
  // =========================================================================
  addToken(
    [
      'meta.diff.header',
      'meta.diff.range',
      'punctuation.definition.from-file',
      'punctuation.definition.to-file',
    ],
    '--syntax-property',
  );

  addToken(['markup.inserted', 'meta.diff.range.inserted'], '--syntax-string');

  addToken(['markup.deleted', 'meta.diff.range.deleted'], '--syntax-error');

  addToken(['markup.changed', 'meta.diff.range.changed'], '--syntax-constant');

  // =========================================================================
  // 16) Specific Token Overrides (web/node focused)
  // =========================================================================

  // Variable specifics
  addToken(['variable.other.readwrite'], '--syntax-variable-readwrite');
  addToken(
    ['variable.parameter', 'variable.parameter.function'],
    '--syntax-variable-parameter',
  );
  addToken(
    [
      'variable.other.property',
      'variable.other.object.property',
      'meta.property.object',
      'meta.definition.property',
    ],
    '--syntax-variable-property',
  );

  // Object literal keys (interface/type property definitions)
  // This MUST come after --syntax-variable-property to override it
  // Interface property names like `data` in `{ data: T }` should be foreground, not purple
  addToken(['meta.object-literal.key'], '--syntax-text');

  // Keyword/Operator specifics
  addToken(
    ['keyword.control', 'keyword.control.flow'],
    '--syntax-keyword-control',
  );
  addToken(
    [
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
    '--syntax-keyword-operator-expression',
  );
  addToken(
    ['keyword.operator.comparison', 'keyword.operator.relational'],
    '--syntax-keyword-operator-comparison',
  );
  addToken(['keyword.operator.logical'], '--syntax-keyword-operator-logical');
  addToken(
    [
      'keyword.operator.arithmetic',
      'keyword.operator.increment',
      'keyword.operator.decrement',
    ],
    '--syntax-keyword-operator-arithmetic',
  );
  addToken(
    ['keyword.operator.assignment', 'keyword.operator.assignment.compound'],
    '--syntax-keyword-operator-assignment',
  );

  // Type specifics
  addToken(['support.type.primitive'], '--syntax-type-primitive');
  addToken(
    ['entity.name.class', 'support.class', 'entity.name.type.class'],
    '--syntax-type-class',
  );
  addToken(
    ['entity.name.type', 'entity.name.type.interface', 'support.type'],
    '--syntax-type-interface',
  );

  // String/Template specifics
  addToken(
    [
      'punctuation.definition.template-expression.begin',
      'punctuation.definition.template-expression.end',
      'punctuation.section.embedded',
    ],
    '--syntax-string-template-expression',
  );
  addToken(['constant.character.escape'], '--syntax-string-escape');

  // Web framework specifics (JS/TS/React/Vue/Angular)
  addToken(
    ['support.class.component', 'entity.name.tag.js', 'entity.name.tag.tsx'],
    '--syntax-jsx-tag',
  );
  addToken(
    [
      'entity.other.attribute-name.js',
      'entity.other.attribute-name.ts',
      'entity.other.attribute-name.jsx',
      'entity.other.attribute-name.tsx',
    ],
    '--syntax-jsx-attribute',
  );
  addToken(
    [
      'entity.name.type.module',
      'support.module.node',
      'support.type.object.module',
    ],
    '--syntax-module',
  );
  addToken(['support.type.property-name.json'], '--syntax-json-property');
  addToken(
    ['support.type.property-name.css', 'meta.property-name.css'],
    '--syntax-css-property',
  );
  addToken(['meta.property-value.css'], '--syntax-css-value');
  addToken(['meta.selector', 'meta.selector.css'], '--syntax-css-selector');
  addToken(
    ['keyword.other.unit', 'keyword.other.unit.css'],
    '--syntax-css-unit',
  );

  // Regex specifics
  addToken(['source.regexp', 'string.regexp'], '--syntax-regexp');
  addToken(
    [
      'punctuation.definition.group.regexp',
      'punctuation.definition.character-class.regexp',
      'keyword.operator.quantifier.regexp',
      'keyword.operator.or.regexp',
      'keyword.control.anchor.regexp',
    ],
    '--syntax-regexp-group',
  );

  // Additional specific tokens
  addToken(['storage', 'storage.type', 'storage.modifier'], '--syntax-storage');
  addToken(['entity.name.tag.html'], '--syntax-html-tag');
  addToken(['variable.other.constant'], '--syntax-variable-constant');
  addToken(['entity.other.inherited-class'], '--syntax-class-inherited');
  addToken(['entity.other.attribute-name.class.css'], '--syntax-css-class');
  addToken(
    ['punctuation.section.embedded.begin', 'punctuation.section.embedded.end'],
    '--syntax-embedded-punctuation',
  );

  // =========================================================================
  // 17) Fallback / default text
  // =========================================================================
  addToken(['source', 'text'], '--syntax-text');

  return tokenColors;
}

// =============================================================================
// Theme JSON Generation
// =============================================================================

/**
 * Generate a complete VS Code theme JSON
 */
function generateTheme(
  type: 'light' | 'dark',
  hexVars: ColorVariables,
  fontStyles: ColorVariables,
): VSCodeTheme {
  const editorFg = hexVars['--syntax-editor-foreground'] || '#000000';
  const editorBg = hexVars['--syntax-editor-background'] || '#00000000';

  const colors: VSCodeTheme['colors'] = {
    'editor.foreground': editorFg,
    'editor.background': editorBg,
  };

  // Add bracket highlight colors (variable length, only if defined)
  for (let i = 1; i <= 6; i++) {
    const varName = `--syntax-bracket-highlight-foreground${i}`;
    const color = hexVars[varName];
    // Only add if defined and not black (fallback for undefined)
    if (color && color !== '#000000') {
      colors[`editorBracketHighlight.foreground${i}`] = color;
    }
  }

  const name = type === 'dark' ? 'stagewise-dark' : 'stagewise-light';

  return {
    $schema: 'vscode://schemas/color-theme',
    name,
    type,
    colors,
    tokenColors: buildTokenColors(hexVars, fontStyles),
  };
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  console.log('🎨 Parsing CSS files...');
  const themeColors = parseCSSFiles();

  console.log('🔗 Resolving light mode variables...');
  const resolvedLight = resolveSyntaxVariables(themeColors.light);

  console.log('🔗 Resolving dark mode variables...');
  const resolvedDark = resolveSyntaxVariables(themeColors.dark);

  console.log('🎨 Extracting font styles...');
  const fontStylesLight = extractFontStyles(themeColors.light);
  const fontStylesDark = extractFontStyles(themeColors.dark);

  console.log('🌈 Converting to hex...');
  const hexLight = convertToHex(resolvedLight);
  const hexDark = convertToHex(resolvedDark);

  console.log('\n📊 Light mode colors:');
  for (const [name, color] of Object.entries(hexLight)) {
    console.log(`  ${name}: ${color}`);
  }

  console.log('\n📊 Light mode font styles:');
  for (const [name, style] of Object.entries(fontStylesLight)) {
    console.log(`  ${name}: ${style}`);
  }

  console.log('\n📊 Dark mode colors:');
  for (const [name, color] of Object.entries(hexDark)) {
    console.log(`  ${name}: ${color}`);
  }

  console.log('\n📊 Dark mode font styles:');
  for (const [name, style] of Object.entries(fontStylesDark)) {
    console.log(`  ${name}: ${style}`);
  }

  console.log('\n📝 Generating theme JSONs...');
  const lightTheme = generateTheme('light', hexLight, fontStylesLight);
  const darkTheme = generateTheme('dark', hexDark, fontStylesDark);

  // Output paths
  const outputDir = path.resolve(
    __dirname,
    '../../../../apps/browser/src/ui/components/ui',
  );

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lightPath = path.join(outputDir, 'code-block-light-theme.json');
  const darkPath = path.join(outputDir, 'code-block-dark-theme.json');

  console.log(`\n💾 Writing ${lightPath}...`);
  fs.writeFileSync(lightPath, JSON.stringify(lightTheme, null, 2));

  console.log(`💾 Writing ${darkPath}...`);
  fs.writeFileSync(darkPath, JSON.stringify(darkTheme, null, 2));

  console.log('\n✅ Theme generation complete!');
}

main();
