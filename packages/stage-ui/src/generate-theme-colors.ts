#!/usr/bin/env tsx
/**
 * Theme Colors Generator
 *
 * Generates the theme-colors.ts file for the browser app by:
 * 1. Parsing CSS color definitions from palette.css and theme.css
 * 2. Resolving CSS variable references
 * 3. Converting OKLCH colors to hex
 * 4. Outputting a TypeScript file with the resolved colors
 *
 * This ensures the Electron window background colors stay in sync
 * with the CSS color palette.
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

// =============================================================================
// CSS Parsing (adapted from generate-code-block-theme-json.ts)
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
  const palettePath = path.join(__dirname, 'styles/palette.css');
  const themePath = path.join(__dirname, 'styles/theme.css');

  const paletteCss = fs.readFileSync(palettePath, 'utf-8');
  const themeCss = fs.readFileSync(themePath, 'utf-8');

  // Parse light mode (from @theme default blocks)
  const paletteLight = parseThemeDefaultBlock(paletteCss);
  const themeLight = parseThemeDefaultBlock(themeCss);

  // Parse dark mode (from @media blocks)
  const paletteDark = parseThemeDefaultBlock(paletteCss); // Palette is shared
  const themeDark = parseDarkModeBlock(themeCss);

  return {
    light: { ...paletteLight, ...themeLight },
    dark: { ...paletteLight, ...paletteDark, ...themeDark },
  };
}

// =============================================================================
// Variable Resolution
// =============================================================================

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

  if (!value) {
    console.warn(`Variable ${varName} not found`);
    return '';
  }

  return value;
}

/**
 * Get the direct reference of a variable (first level only).
 * E.g., --color-app-background -> var(--color-base-200)
 * Returns the referenced variable name or null if it's a direct value.
 */
function getDirectReference(
  varName: string,
  vars: ColorVariables,
): string | null {
  const value = vars[varName];
  if (!value) return null;

  // Check if the value is a var() reference
  const varRefMatch = value.match(/^\s*var\((--[\w-]+)\)\s*$/);
  if (varRefMatch) {
    return varRefMatch[1] ?? null;
  }

  return null;
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

  if (!value) {
    console.warn(`Variable ${varName} not found`);
    return '';
  }

  // Check if the ENTIRE value is a single var() reference
  const fullVarRefRegex = /^\s*var\((--[\w-]+)\)\s*$/;
  const fullMatch = value.match(fullVarRefRegex);

  if (fullMatch) {
    // Recursively resolve the referenced variable
    return resolveVariable(fullMatch[1] ?? '', vars, visited);
  }

  // Substitute ALL var() references within the value
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
  const hex = formatHex({ mode: 'oklch', l, c, h });
  return hex || '#000000';
}

/**
 * Resolve a variable and convert to hex
 */
function resolveToHex(varName: string, vars: ColorVariables): string {
  const resolved = resolveVariable(varName, vars);

  if (!resolved) {
    return '#000000';
  }

  if (resolved.startsWith('oklch')) {
    return oklchToHex(resolved);
  }

  if (resolved.startsWith('#')) {
    return resolved;
  }

  // Try to parse any color format
  const parsed = parse(resolved);
  if (parsed) {
    return formatHex(parsed) || '#000000';
  }

  console.warn(`Could not convert to hex: ${varName} = ${resolved}`);
  return '#000000';
}

// =============================================================================
// Theme Colors Generation
// =============================================================================

function generateThemeColorsFile(themeColors: ThemeColors): string {
  // Resolve the colors we need
  const lightBackground = resolveToHex(
    '--color-app-background',
    themeColors.light,
  );
  const darkBackground = resolveToHex(
    '--color-app-background',
    themeColors.dark,
  );

  // For titlebar symbol colors, use foreground colors
  const lightSymbolColor = resolveToHex(
    '--color-foreground',
    themeColors.light,
  );
  const darkSymbolColor = resolveToHex('--color-foreground', themeColors.dark);

  // Get direct references to palette variables for documentation
  const lightBgRef = getDirectReference(
    '--color-app-background',
    themeColors.light,
  );
  const darkBgRef = getDirectReference(
    '--color-app-background',
    themeColors.dark,
  );
  const lightFgRef = getDirectReference(
    '--color-foreground',
    themeColors.light,
  );
  const darkFgRef = getDirectReference('--color-foreground', themeColors.dark);

  // Format comments with palette variable info
  const lightBgComment = lightBgRef
    ? `// theme.css: --color-app-background → ${lightBgRef}`
    : '// theme.css: --color-app-background';
  const darkBgComment = darkBgRef
    ? `// theme.css: --color-app-background → ${darkBgRef}`
    : '// theme.css: --color-app-background';
  const lightFgComment = lightFgRef
    ? `// theme.css: --color-foreground → ${lightFgRef}`
    : '// theme.css: --color-foreground';
  const darkFgComment = darkFgRef
    ? `// theme.css: --color-foreground → ${darkFgRef}`
    : '// theme.css: --color-foreground';

  return `/**
 * Shared theme colors used throughout the application.
 * These colors are used for window backgrounds and webcontents backgrounds
 * to ensure consistent theming across light and dark modes.
 *
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Run "pnpm generate:theme-colors" in packages/stage-ui to regenerate.
 * Source: packages/stage-ui/src/palette.css and theme.css
 */

export const THEME_COLORS = {
  light: {
    background: '${lightBackground}', ${lightBgComment}
    titleBarOverlay: {
      color: '${lightBackground}', ${lightBgComment}
      symbolColor: '${lightSymbolColor}', ${lightFgComment}
    },
  },
  dark: {
    background: '${darkBackground}', ${darkBgComment}
    titleBarOverlay: {
      color: '${darkBackground}', ${darkBgComment}
      symbolColor: '${darkSymbolColor}', ${darkFgComment}
    },
  },
} as const;
`;
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  console.log('🎨 Parsing CSS files...');
  const themeColors = parseCSSFiles();

  console.log('🔗 Resolving theme colors...');
  console.log(
    `  Light background: ${resolveVariable('--color-app-background', themeColors.light)}`,
  );
  console.log(
    `  Dark background: ${resolveVariable('--color-app-background', themeColors.dark)}`,
  );

  console.log('🌈 Converting to hex...');
  const lightBg = resolveToHex('--color-app-background', themeColors.light);
  const darkBg = resolveToHex('--color-app-background', themeColors.dark);
  console.log(`  Light: ${lightBg}`);
  console.log(`  Dark: ${darkBg}`);

  console.log('📝 Generating theme-colors.ts...');
  const output = generateThemeColorsFile(themeColors);

  // Output path
  const outputPath = path.resolve(
    __dirname,
    '../../../apps/browser/src/backend/shared/theme-colors.ts',
  );

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`💾 Writing ${outputPath}...`);
  fs.writeFileSync(outputPath, output);

  console.log('✅ Theme colors generation complete!');
}

main();
