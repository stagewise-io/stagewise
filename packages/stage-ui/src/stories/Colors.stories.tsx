import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Tailwind Safelist for palette.css colors
 * These classes ensure Tailwind generates all color utilities from palette.css
 *
 * bg-primary-50 bg-primary-100 bg-primary-150 bg-primary-200 bg-primary-250 bg-primary-300 bg-primary-350 bg-primary-400 bg-primary-450 bg-primary-500 bg-primary-550 bg-primary-600 bg-primary-650 bg-primary-700 bg-primary-750 bg-primary-800 bg-primary-850 bg-primary-900 bg-primary-950
 * text-primary-50 text-primary-100 text-primary-150 text-primary-200 text-primary-250 text-primary-300 text-primary-350 text-primary-400 text-primary-450 text-primary-500 text-primary-550 text-primary-600 text-primary-650 text-primary-700 text-primary-750 text-primary-800 text-primary-850 text-primary-900 text-primary-950
 * border-primary-50 border-primary-100 border-primary-150 border-primary-200 border-primary-250 border-primary-300 border-primary-350 border-primary-400 border-primary-450 border-primary-500 border-primary-550 border-primary-600 border-primary-650 border-primary-700 border-primary-750 border-primary-800 border-primary-850 border-primary-900 border-primary-950
 * bg-base-50 bg-base-100 bg-base-150 bg-base-200 bg-base-250 bg-base-300 bg-base-350 bg-base-400 bg-base-450 bg-base-500 bg-base-550 bg-base-600 bg-base-650 bg-base-700 bg-base-750 bg-base-800 bg-base-850 bg-base-900 bg-base-950
 * text-base-50 text-base-100 text-base-150 text-base-200 text-base-250 text-base-300 text-base-350 text-base-400 text-base-450 text-base-500 text-base-550 text-base-600 text-base-650 text-base-700 text-base-750 text-base-800 text-base-850 text-base-900 text-base-950
 * border-base-50 border-base-100 border-base-150 border-base-200 border-base-250 border-base-300 border-base-350 border-base-400 border-base-450 border-base-500 border-base-550 border-base-600 border-base-650 border-base-700 border-base-750 border-base-800 border-base-850 border-base-900 border-base-950
 * Semantic colors (light/dark variants for foreground, background, solid):
 * bg-[var(--color-success-foreground-light)] bg-[var(--color-success-foreground-dark)] bg-[var(--color-success-background-light)] bg-[var(--color-success-background-dark)] bg-[var(--color-success-solid-light)] bg-[var(--color-success-solid-dark)]
 * bg-[var(--color-error-foreground-light)] bg-[var(--color-error-foreground-dark)] bg-[var(--color-error-background-light)] bg-[var(--color-error-background-dark)] bg-[var(--color-error-solid-light)] bg-[var(--color-error-solid-dark)]
 * bg-[var(--color-warning-foreground-light)] bg-[var(--color-warning-foreground-dark)] bg-[var(--color-warning-background-light)] bg-[var(--color-warning-background-dark)] bg-[var(--color-warning-solid-light)] bg-[var(--color-warning-solid-dark)]
 * bg-[var(--color-info-foreground-light)] bg-[var(--color-info-foreground-dark)] bg-[var(--color-info-background-light)] bg-[var(--color-info-background-dark)] bg-[var(--color-info-solid-light)] bg-[var(--color-info-solid-dark)]
 * text-success-foreground text-success-background text-success-solid text-error-foreground text-error-background text-error-solid text-warning-foreground text-warning-background text-warning-solid text-info-foreground text-info-background text-info-solid
 *
 * Syntax highlighting colors (from syntax.css):
 * bg-syntax-text bg-syntax-punctuation bg-syntax-operator bg-syntax-comment bg-syntax-keyword bg-syntax-function bg-syntax-type bg-syntax-decorator bg-syntax-namespace bg-syntax-reference-modifier bg-syntax-property bg-syntax-language-variable bg-syntax-string bg-syntax-number bg-syntax-constant bg-syntax-directive bg-syntax-tag bg-syntax-tag-punctuation bg-syntax-meta bg-syntax-error
 * text-syntax-text text-syntax-punctuation text-syntax-operator text-syntax-comment text-syntax-keyword text-syntax-function text-syntax-type text-syntax-decorator text-syntax-namespace text-syntax-reference-modifier text-syntax-property text-syntax-language-variable text-syntax-string text-syntax-number text-syntax-constant text-syntax-directive text-syntax-tag text-syntax-tag-punctuation text-syntax-meta text-syntax-error
 * border-syntax-text border-syntax-punctuation border-syntax-operator border-syntax-comment border-syntax-keyword border-syntax-function border-syntax-type border-syntax-decorator border-syntax-namespace border-syntax-reference-modifier border-syntax-property border-syntax-language-variable border-syntax-string border-syntax-number border-syntax-constant border-syntax-directive border-syntax-tag border-syntax-tag-punctuation border-syntax-meta border-syntax-error
 *
 * Specific syntax token overrides (web/node focused):
 * bg-syntax-variable-readwrite bg-syntax-variable-parameter bg-syntax-variable-property bg-syntax-keyword-control bg-syntax-keyword-operator-expression bg-syntax-keyword-operator-comparison bg-syntax-keyword-operator-logical bg-syntax-keyword-operator-arithmetic bg-syntax-keyword-operator-assignment bg-syntax-type-primitive bg-syntax-type-class bg-syntax-type-interface bg-syntax-string-template-expression bg-syntax-string-escape bg-syntax-jsx-tag bg-syntax-jsx-attribute bg-syntax-module bg-syntax-json-property bg-syntax-css-property bg-syntax-css-value bg-syntax-css-selector bg-syntax-css-unit bg-syntax-regexp bg-syntax-regexp-group bg-syntax-storage bg-syntax-html-tag bg-syntax-variable-constant bg-syntax-class-inherited bg-syntax-css-class bg-syntax-embedded-punctuation
 * text-syntax-variable-readwrite text-syntax-variable-parameter text-syntax-variable-property text-syntax-keyword-control text-syntax-keyword-operator-expression text-syntax-keyword-operator-comparison text-syntax-keyword-operator-logical text-syntax-keyword-operator-arithmetic text-syntax-keyword-operator-assignment text-syntax-type-primitive text-syntax-type-class text-syntax-type-interface text-syntax-string-template-expression text-syntax-string-escape text-syntax-jsx-tag text-syntax-jsx-attribute text-syntax-module text-syntax-json-property text-syntax-css-property text-syntax-css-value text-syntax-css-selector text-syntax-css-unit text-syntax-regexp text-syntax-regexp-group text-syntax-storage text-syntax-html-tag text-syntax-variable-constant text-syntax-class-inherited text-syntax-css-class text-syntax-embedded-punctuation
 * border-syntax-variable-readwrite border-syntax-variable-parameter border-syntax-variable-property border-syntax-keyword-control border-syntax-keyword-operator-expression border-syntax-keyword-operator-comparison border-syntax-keyword-operator-logical border-syntax-keyword-operator-arithmetic border-syntax-keyword-operator-assignment border-syntax-type-primitive border-syntax-type-class border-syntax-type-interface border-syntax-string-template-expression border-syntax-string-escape border-syntax-jsx-tag border-syntax-jsx-attribute border-syntax-module border-syntax-json-property border-syntax-css-property border-syntax-css-value border-syntax-css-selector border-syntax-css-unit border-syntax-regexp border-syntax-regexp-group border-syntax-storage border-syntax-html-tag border-syntax-variable-constant border-syntax-class-inherited border-syntax-css-class border-syntax-embedded-punctuation
 *
 * Example theme syntax highlighting colors (from syntax-example-theme.css):
 * bg-example-syntax-editor-foreground bg-example-syntax-editor-background bg-example-syntax-text bg-example-syntax-punctuation bg-example-syntax-operator bg-example-syntax-comment bg-example-syntax-keyword bg-example-syntax-function bg-example-syntax-type bg-example-syntax-decorator bg-example-syntax-namespace bg-example-syntax-reference-modifier bg-example-syntax-property bg-example-syntax-language-variable bg-example-syntax-string bg-example-syntax-number bg-example-syntax-constant bg-example-syntax-directive bg-example-syntax-tag bg-example-syntax-tag-punctuation bg-example-syntax-meta bg-example-syntax-error
 * text-example-syntax-editor-foreground text-example-syntax-editor-background text-example-syntax-text text-example-syntax-punctuation text-example-syntax-operator text-example-syntax-comment text-example-syntax-keyword text-example-syntax-function text-example-syntax-type text-example-syntax-decorator text-example-syntax-namespace text-example-syntax-reference-modifier text-example-syntax-property text-example-syntax-language-variable text-example-syntax-string text-example-syntax-number text-example-syntax-constant text-example-syntax-directive text-example-syntax-tag text-example-syntax-tag-punctuation text-example-syntax-meta text-example-syntax-error
 * border-example-syntax-editor-foreground border-example-syntax-editor-background border-example-syntax-text border-example-syntax-punctuation border-example-syntax-operator border-example-syntax-comment border-example-syntax-keyword border-example-syntax-function border-example-syntax-type border-example-syntax-decorator border-example-syntax-namespace border-example-syntax-reference-modifier border-example-syntax-property border-example-syntax-language-variable border-example-syntax-string border-example-syntax-number border-example-syntax-constant border-example-syntax-directive border-example-syntax-tag border-example-syntax-tag-punctuation border-example-syntax-meta border-example-syntax-error
 *
 * Example theme specific syntax token overrides:
 * bg-example-syntax-variable-readwrite bg-example-syntax-variable-parameter bg-example-syntax-variable-property bg-example-syntax-keyword-control bg-example-syntax-keyword-operator-expression bg-example-syntax-keyword-operator-comparison bg-example-syntax-keyword-operator-logical bg-example-syntax-keyword-operator-arithmetic bg-example-syntax-keyword-operator-assignment bg-example-syntax-type-primitive bg-example-syntax-type-class bg-example-syntax-type-interface bg-example-syntax-string-template-expression bg-example-syntax-string-escape bg-example-syntax-jsx-tag bg-example-syntax-jsx-attribute bg-example-syntax-module bg-example-syntax-json-property bg-example-syntax-css-property bg-example-syntax-css-value bg-example-syntax-css-selector bg-example-syntax-css-unit bg-example-syntax-regexp bg-example-syntax-regexp-group bg-example-syntax-storage bg-example-syntax-html-tag bg-example-syntax-variable-constant bg-example-syntax-class-inherited bg-example-syntax-css-class bg-example-syntax-embedded-punctuation
 * text-example-syntax-variable-readwrite text-example-syntax-variable-parameter text-example-syntax-variable-property text-example-syntax-keyword-control text-example-syntax-keyword-operator-expression text-example-syntax-keyword-operator-comparison text-example-syntax-keyword-operator-logical text-example-syntax-keyword-operator-arithmetic text-example-syntax-keyword-operator-assignment text-example-syntax-type-primitive text-example-syntax-type-class text-example-syntax-type-interface text-example-syntax-string-template-expression text-example-syntax-string-escape text-example-syntax-jsx-tag text-example-syntax-jsx-attribute text-example-syntax-module text-example-syntax-json-property text-example-syntax-css-property text-example-syntax-css-value text-example-syntax-css-selector text-example-syntax-css-unit text-example-syntax-regexp text-example-syntax-regexp-group text-example-syntax-storage text-example-syntax-html-tag text-example-syntax-variable-constant text-example-syntax-class-inherited text-example-syntax-css-class text-example-syntax-embedded-punctuation
 * border-example-syntax-variable-readwrite border-example-syntax-variable-parameter border-example-syntax-variable-property border-example-syntax-keyword-control border-example-syntax-keyword-operator-expression border-example-syntax-keyword-operator-comparison border-example-syntax-keyword-operator-logical border-example-syntax-keyword-operator-arithmetic border-example-syntax-keyword-operator-assignment border-example-syntax-type-primitive border-example-syntax-type-class border-example-syntax-type-interface border-example-syntax-string-template-expression border-example-syntax-string-escape border-example-syntax-jsx-tag border-example-syntax-jsx-attribute border-example-syntax-module border-example-syntax-json-property border-example-syntax-css-property border-example-syntax-css-value border-example-syntax-css-selector border-example-syntax-css-unit border-example-syntax-regexp border-example-syntax-regexp-group border-example-syntax-storage border-example-syntax-html-tag border-example-syntax-variable-constant border-example-syntax-class-inherited border-example-syntax-css-class border-example-syntax-embedded-punctuation
 *
 * Bracket highlight colors:
 * bg-syntax-bracket-highlight-foreground1 bg-syntax-bracket-highlight-foreground2 bg-syntax-bracket-highlight-foreground3 bg-syntax-bracket-highlight-foreground4 bg-syntax-bracket-highlight-foreground5 bg-syntax-bracket-highlight-foreground6
 * text-syntax-bracket-highlight-foreground1 text-syntax-bracket-highlight-foreground2 text-syntax-bracket-highlight-foreground3 text-syntax-bracket-highlight-foreground4 text-syntax-bracket-highlight-foreground5 text-syntax-bracket-highlight-foreground6
 * border-syntax-bracket-highlight-foreground1 border-syntax-bracket-highlight-foreground2 border-syntax-bracket-highlight-foreground3 border-syntax-bracket-highlight-foreground4 border-syntax-bracket-highlight-foreground5 border-syntax-bracket-highlight-foreground6
 *
 * Example theme bracket highlight colors:
 * bg-example-syntax-bracket-highlight-foreground1 bg-example-syntax-bracket-highlight-foreground2 bg-example-syntax-bracket-highlight-foreground3 bg-example-syntax-bracket-highlight-foreground4 bg-example-syntax-bracket-highlight-foreground5 bg-example-syntax-bracket-highlight-foreground6
 * text-example-syntax-bracket-highlight-foreground1 text-example-syntax-bracket-highlight-foreground2 text-example-syntax-bracket-highlight-foreground3 text-example-syntax-bracket-highlight-foreground4 text-example-syntax-bracket-highlight-foreground5 text-example-syntax-bracket-highlight-foreground6
 * border-example-syntax-bracket-highlight-foreground1 border-example-syntax-bracket-highlight-foreground2 border-example-syntax-bracket-highlight-foreground3 border-example-syntax-bracket-highlight-foreground4 border-example-syntax-bracket-highlight-foreground5 border-example-syntax-bracket-highlight-foreground6
 *
 * Base syntax colors from palette.css (raw color values):
 * bg-[var(--color-syntax-green-light)] bg-[var(--color-syntax-green-dark)] bg-[var(--color-syntax-red-light)] bg-[var(--color-syntax-red-dark)] bg-[var(--color-syntax-blue-light)] bg-[var(--color-syntax-blue-dark)] bg-[var(--color-syntax-yellow-light)] bg-[var(--color-syntax-yellow-dark)] bg-[var(--color-syntax-pink-light)] bg-[var(--color-syntax-pink-dark)] bg-[var(--color-syntax-cyan-light)] bg-[var(--color-syntax-cyan-dark)] bg-[var(--color-syntax-orange-light)] bg-[var(--color-syntax-orange-dark)] bg-[var(--color-syntax-purple-light)] bg-[var(--color-syntax-purple-dark)]
 * bg-[var(--syntax-bracket-highlight-foreground1)] bg-[var(--syntax-bracket-highlight-foreground2)] bg-[var(--syntax-bracket-highlight-foreground3)] bg-[var(--syntax-bracket-highlight-foreground4)] bg-[var(--syntax-bracket-highlight-foreground5)] bg-[var(--syntax-bracket-highlight-foreground6)]
 */

const allShades = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
  850, 900, 950,
];

const ColorRamp = ({
  title,
  colorVar,
  textColor,
}: {
  title: string;
  colorVar: 'primary' | 'base';
  textColor: string;
}) => {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-sm" style={{ color: textColor }}>
        {title}
      </h3>
      <div className="flex flex-row flex-wrap items-start justify-start">
        {allShades.map((shade) => (
          <div
            key={shade}
            className="flex size-11 items-end justify-start p-1"
            style={{ backgroundColor: `var(--color-${colorVar}-${shade})` }}
          >
            <span
              className="font-mono text-[10px]"
              style={{
                color:
                  shade < 500
                    ? 'var(--color-base-900)'
                    : 'var(--color-base-100)',
              }}
            >
              {shade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SemanticColorCard = ({
  title,
  colorName,
  textColor,
}: {
  title: string;
  colorName: 'success' | 'warning' | 'error' | 'info';
  textColor: string;
}) => {
  const variants = [
    { label: 'Foreground', varSuffix: 'foreground' },
    { label: 'Background', varSuffix: 'background' },
    { label: 'Solid', varSuffix: 'solid' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium text-sm" style={{ color: textColor }}>
        {title}
      </h4>
      <div className="flex flex-col gap-2">
        {variants.map((variant) => (
          <div key={variant.varSuffix} className="flex flex-col gap-1">
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ color: textColor, opacity: 0.6 }}
            >
              {variant.label}
            </span>
            <div className="flex gap-1">
              {/* Light mode */}
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="size-10 rounded"
                  style={{
                    backgroundColor: `var(--color-${colorName}-${variant.varSuffix}-light)`,
                  }}
                />
                <span
                  className="text-[8px]"
                  style={{ color: textColor, opacity: 0.5 }}
                >
                  L
                </span>
              </div>
              {/* Dark mode */}
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="size-10 rounded"
                  style={{
                    backgroundColor: `var(--color-${colorName}-${variant.varSuffix}-dark)`,
                  }}
                />
                <span
                  className="text-[8px]"
                  style={{ color: textColor, opacity: 0.5 }}
                >
                  D
                </span>
              </div>
            </div>
          </div>
        ))}
        {/* Foreground text preview */}
        <div className="mt-1 flex flex-col gap-1">
          <span
            className="text-xs"
            style={{ color: `var(--color-${colorName}-foreground-light)` }}
          >
            {title} Text (Light)
          </span>
          <span
            className="text-xs"
            style={{ color: `var(--color-${colorName}-foreground-dark)` }}
          >
            {title} Text (Dark)
          </span>
        </div>
      </div>
    </div>
  );
};

const syntaxTokens = [
  { name: 'text', label: 'Text', description: 'Default text & identifiers' },
  {
    name: 'punctuation',
    label: 'Punctuation',
    description: 'Brackets, delimiters',
  },
  {
    name: 'operator',
    label: 'Operator',
    description: 'Operators (+, -, =, etc.)',
  },
  { name: 'comment', label: 'Comment', description: 'Code comments' },
  { name: 'keyword', label: 'Keyword', description: 'Language keywords' },
  {
    name: 'function',
    label: 'Function',
    description: 'Function names & calls',
  },
  { name: 'type', label: 'Type', description: 'Types, classes, interfaces' },
  {
    name: 'decorator',
    label: 'Decorator',
    description: 'Decorators & annotations',
  },
  {
    name: 'namespace',
    label: 'Namespace',
    description: 'Namespaces & modules',
  },
  {
    name: 'reference-modifier',
    label: 'Reference',
    description: 'Pointers & references',
  },
  {
    name: 'property',
    label: 'Property',
    description: 'Object properties & attributes',
  },
  {
    name: 'language-variable',
    label: 'Language Var',
    description: 'this, self, etc.',
  },
  { name: 'string', label: 'String', description: 'String literals' },
  { name: 'number', label: 'Number', description: 'Numeric literals' },
  { name: 'constant', label: 'Constant', description: 'Constants & booleans' },
  {
    name: 'directive',
    label: 'Directive',
    description: 'Preprocessor directives',
  },
  { name: 'tag', label: 'Tag', description: 'HTML/JSX tags' },
  {
    name: 'tag-punctuation',
    label: 'Tag Punct.',
    description: 'Tag brackets < >',
  },
  { name: 'meta', label: 'Meta', description: 'Metadata & doctypes' },
  { name: 'error', label: 'Error', description: 'Invalid/error tokens' },
];

// Specific token overrides for finer control (web/node focused)
const specificSyntaxTokens = [
  // Variable specifics
  {
    name: 'variable-readwrite',
    label: 'Var Read/Write',
    description: 'Regular variables',
    category: 'Variables',
  },
  {
    name: 'variable-parameter',
    label: 'Parameter',
    description: 'Function parameters',
    category: 'Variables',
  },
  {
    name: 'variable-property',
    label: 'Var Property',
    description: 'Object properties',
    category: 'Variables',
  },
  // Keyword/Operator specifics
  {
    name: 'keyword-control',
    label: 'Control',
    description: 'Control flow (if, for)',
    category: 'Keywords',
  },
  {
    name: 'keyword-operator-expression',
    label: 'Op Expr',
    description: 'typeof, instanceof',
    category: 'Keywords',
  },
  {
    name: 'keyword-operator-comparison',
    label: 'Op Compare',
    description: '==, ===, <, >',
    category: 'Keywords',
  },
  {
    name: 'keyword-operator-logical',
    label: 'Op Logical',
    description: '&&, ||, !',
    category: 'Keywords',
  },
  {
    name: 'keyword-operator-arithmetic',
    label: 'Op Arith',
    description: '+, -, *, /',
    category: 'Keywords',
  },
  {
    name: 'keyword-operator-assignment',
    label: 'Op Assign',
    description: '=, +=, -=',
    category: 'Keywords',
  },
  // Type specifics
  {
    name: 'type-primitive',
    label: 'Primitive',
    description: 'string, number, bool',
    category: 'Types',
  },
  {
    name: 'type-class',
    label: 'Class',
    description: 'Class names',
    category: 'Types',
  },
  {
    name: 'type-interface',
    label: 'Interface',
    description: 'Interface/type names',
    category: 'Types',
  },
  // String/Template specifics
  {
    name: 'string-template-expression',
    label: 'Template Expr',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Just for demonstration
    description: '${} in templates',
    category: 'Strings',
  },
  {
    name: 'string-escape',
    label: 'Escape',
    description: '\\n, \\t, etc.',
    category: 'Strings',
  },
  // Web framework specifics
  {
    name: 'jsx-tag',
    label: 'JSX Tag',
    description: 'React components',
    category: 'Web',
  },
  {
    name: 'jsx-attribute',
    label: 'JSX Attr',
    description: 'JSX attributes',
    category: 'Web',
  },
  {
    name: 'module',
    label: 'Module',
    description: 'Module references',
    category: 'Web',
  },
  {
    name: 'json-property',
    label: 'JSON Prop',
    description: 'JSON property names',
    category: 'Web',
  },
  {
    name: 'css-property',
    label: 'CSS Prop',
    description: 'CSS property names',
    category: 'Web',
  },
  {
    name: 'css-value',
    label: 'CSS Value',
    description: 'CSS property values',
    category: 'Web',
  },
  {
    name: 'css-selector',
    label: 'CSS Selector',
    description: 'CSS selectors',
    category: 'Web',
  },
  {
    name: 'css-unit',
    label: 'CSS Unit',
    description: 'px, rem, em, etc.',
    category: 'Web',
  },
  // Regex specifics
  {
    name: 'regexp',
    label: 'RegExp',
    description: 'Regex patterns',
    category: 'Regex',
  },
  {
    name: 'regexp-group',
    label: 'RegExp Group',
    description: 'Regex groups/ops',
    category: 'Regex',
  },
  // Additional tokens
  {
    name: 'storage',
    label: 'Storage',
    description: 'const, let, var, etc.',
    category: 'Additional',
  },
  {
    name: 'html-tag',
    label: 'HTML Tag',
    description: 'HTML elements',
    category: 'Additional',
  },
  {
    name: 'variable-constant',
    label: 'Var Constant',
    description: 'UPPER_CASE vars',
    category: 'Additional',
  },
  {
    name: 'class-inherited',
    label: 'Inherited',
    description: 'extends Class',
    category: 'Additional',
  },
  {
    name: 'css-class',
    label: 'CSS Class',
    description: '.classname selector',
    category: 'Additional',
  },
  {
    name: 'embedded-punctuation',
    label: 'Embedded',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Just for demonstration
    description: '${} in templates',
    category: 'Additional',
  },
];

// Bracket highlight colors (variable count, up to 6)
const bracketHighlightTokens = [
  { name: 'bracket-highlight-foreground1', label: '1', description: 'Level 1' },
  { name: 'bracket-highlight-foreground2', label: '2', description: 'Level 2' },
  { name: 'bracket-highlight-foreground3', label: '3', description: 'Level 3' },
  { name: 'bracket-highlight-foreground4', label: '4', description: 'Level 4' },
  { name: 'bracket-highlight-foreground5', label: '5', description: 'Level 5' },
  { name: 'bracket-highlight-foreground6', label: '6', description: 'Level 6' },
];

/**
 * Get CSS font properties from a fontStyle string
 * Supports: italic, bold, bold italic, underline, strikethrough
 */
const getFontStyleCSS = (
  fontStyle: string | undefined,
): React.CSSProperties => {
  if (!fontStyle || fontStyle === 'normal') return {};

  const styles: React.CSSProperties = {};
  const parts = fontStyle.toLowerCase().split(/\s+/);

  if (parts.includes('italic')) {
    styles.fontStyle = 'italic';
  }
  if (parts.includes('bold')) {
    styles.fontWeight = 'bold';
  }
  if (parts.includes('underline')) {
    styles.textDecoration = 'underline';
  }
  if (parts.includes('strikethrough')) {
    styles.textDecoration = 'line-through';
  }

  return styles;
};

/**
 * FontStyle indicator badge
 */
const FontStyleBadge = ({
  fontStyle,
  color,
}: {
  fontStyle: string;
  color: string;
}) => {
  const parts = fontStyle.toLowerCase().split(/\s+/);
  const indicators: string[] = [];

  if (parts.includes('italic')) indicators.push('I');
  if (parts.includes('bold')) indicators.push('B');
  if (parts.includes('underline')) indicators.push('U');
  if (parts.includes('strikethrough')) indicators.push('S');

  if (indicators.length === 0) return null;

  return (
    <span
      className="ml-1 rounded px-1 py-0.5 font-mono text-[8px]"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        ...getFontStyleCSS(fontStyle),
      }}
      title={fontStyle}
    >
      {indicators.join('')}
    </span>
  );
};

const SyntaxColorCard = ({
  tokenName,
  label,
  description,
  isExample = false,
}: {
  tokenName: string;
  label: string;
  description: string;
  isExample?: boolean;
}) => {
  const [fontStyle, setFontStyle] = useState<string | undefined>(undefined);
  const varPrefix = isExample ? '--example-syntax-' : '--syntax-';
  const fontStyleVarName = `${varPrefix}${tokenName}-style`;

  // Read the fontStyle CSS variable on mount
  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(fontStyleVarName)
      .trim();
    if (value && value !== 'normal') {
      setFontStyle(value);
    } else {
      setFontStyle(undefined);
    }
  }, [fontStyleVarName]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative size-10 rounded border border-border"
        style={{
          backgroundColor: `var(${varPrefix}${tokenName})`,
          borderColor: isExample ? 'rgba(128,128,128,0.3)' : undefined,
        }}
      >
        {fontStyle && (
          <div className="-top-1 -right-1 absolute">
            <span
              className="flex size-4 items-center justify-center rounded-full bg-black font-bold text-[8px] text-white"
              title={fontStyle}
              style={getFontStyleCSS(fontStyle)}
            >
              {fontStyle.includes('italic') ? 'I' : ''}
              {fontStyle.includes('bold') ? 'B' : ''}
            </span>
          </div>
        )}
      </div>
      <span
        className="flex items-center text-center font-medium text-xs"
        style={{
          color: `var(${varPrefix}${tokenName})`,
          ...getFontStyleCSS(fontStyle),
        }}
      >
        {label}
        {fontStyle && (
          <FontStyleBadge
            fontStyle={fontStyle}
            color={`var(${varPrefix}${tokenName})`}
          />
        )}
      </span>
      <span
        className={`max-w-20 text-center text-[10px] ${isExample ? '' : 'text-muted-foreground'}`}
        style={
          isExample
            ? { color: 'var(--example-syntax-editor-foreground)', opacity: 0.6 }
            : undefined
        }
      >
        {description}
      </span>
    </div>
  );
};

// Base syntax color definitions from palette.css
// These are the raw color values that get mapped to syntax tokens
const baseSyntaxColors = [
  { name: 'green', label: 'Green', hue: 'H-green (152)' },
  { name: 'red', label: 'Red', hue: 'H-red (28)' },
  { name: 'blue', label: 'Blue', hue: 'H-blue (220)' },
  { name: 'yellow', label: 'Yellow', hue: 'H-yellow (80)' },
  { name: 'pink', label: 'Pink', hue: 'H-pink (355)' },
  { name: 'cyan', label: 'Cyan', hue: 'H-cyan (175)' },
  { name: 'orange', label: 'Orange', hue: 'H-orange (55)' },
  { name: 'purple', label: 'Purple', hue: 'H-purple (300)' },
];

type BackgroundMode = 'black' | 'white' | 'theme';

const ColorShowcase = () => {
  const [bgMode, setBgMode] = useState<BackgroundMode>('black');
  const [showExampleTheme, setShowExampleTheme] = useState(false);
  const [showCodeSyntaxMapping, setShowCodeSyntaxMapping] = useState(false);

  // For non-theme modes, derive isDark for text color logic
  const isDark = bgMode === 'black';
  const useThemeColors = bgMode === 'theme';

  const getBgStyle = (): React.CSSProperties => {
    switch (bgMode) {
      case 'black':
        return { backgroundColor: 'black' };
      case 'white':
        return { backgroundColor: 'white' };
      case 'theme':
        return {}; // Will use className
    }
  };

  // Helper to get text color based on mode
  const getTextColor = (opacity?: number): string => {
    if (useThemeColors) return `var(--color-foreground)`;
    const base = isDark ? '255,255,255' : '0,0,0';
    return opacity ? `rgba(${base},${opacity})` : isDark ? 'white' : 'black';
  };

  // Helper to get muted text color
  const getMutedTextColor = (): string => {
    if (useThemeColors) return `var(--color-muted-foreground)`;
    return isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  };

  // Helper for button backgrounds
  const getButtonBg = (isActive: boolean): string => {
    if (isActive) return 'var(--color-primary-500)';
    if (useThemeColors) return 'var(--color-surface-1)';
    return isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  };

  return (
    <div
      className={`flex min-h-screen flex-col gap-8 p-8 ${bgMode === 'theme' ? 'bg-background' : ''}`}
      style={getBgStyle()}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="mb-2 font-bold text-2xl"
            style={{ color: getTextColor() }}
          >
            Color Palette
          </h2>
          <p className="text-sm" style={{ color: getMutedTextColor() }}>
            Complete color ramps with all 50s steps for primary, base, and
            semantic colors.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-1 rounded-lg p-1"
            style={{
              backgroundColor: getButtonBg(false),
            }}
          >
            {(['black', 'white', 'theme'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBgMode(mode)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs transition-colors"
                style={{
                  backgroundColor:
                    bgMode === mode
                      ? 'var(--color-primary-500)'
                      : 'transparent',
                  color: bgMode === mode ? 'white' : getTextColor(),
                }}
              >
                <span
                  className="size-3 rounded-sm border"
                  style={{
                    backgroundColor:
                      mode === 'black'
                        ? 'black'
                        : mode === 'white'
                          ? 'white'
                          : 'var(--color-background)',
                    borderColor:
                      mode === 'black'
                        ? 'white'
                        : mode === 'white'
                          ? 'black'
                          : 'var(--color-border)',
                  }}
                />
                {mode === 'black'
                  ? 'Black'
                  : mode === 'white'
                    ? 'White'
                    : 'Theme'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Ramp */}
      <ColorRamp
        title="Primary"
        colorVar="primary"
        textColor={getTextColor()}
      />

      {/* Base Ramp */}
      <ColorRamp
        title="Base (Neutrals)"
        colorVar="base"
        textColor={getTextColor()}
      />

      {/* Semantic Colors */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-sm" style={{ color: getTextColor() }}>
          Semantic Colors
        </h3>
        <div className="flex flex-row items-start gap-8">
          <SemanticColorCard
            title="Success"
            colorName="success"
            textColor={getTextColor()}
          />
          <SemanticColorCard
            title="Warning"
            colorName="warning"
            textColor={getTextColor()}
          />
          <SemanticColorCard
            title="Error"
            colorName="error"
            textColor={getTextColor()}
          />
          <SemanticColorCard
            title="Info"
            colorName="info"
            textColor={getTextColor()}
          />
        </div>
        <div
          className="mt-2 flex flex-row gap-4 text-xs"
          style={{ color: getMutedTextColor() }}
        >
          <span>L = Light mode</span>
          <span>D = Dark mode</span>
        </div>
      </div>

      {/* Base Syntax Colors from palette.css */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3
            className="font-semibold text-sm"
            style={{ color: getTextColor() }}
          >
            Base Syntax Colors (palette.css)
          </h3>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: getTextColor(0.5) }}>
            Raw color values from palette.css that get mapped to syntax tokens.
            Light/dark variants use different L/C values in OKLCH.
          </p>
          <div className="flex flex-wrap gap-4">
            {baseSyntaxColors.map((color) => (
              <div
                key={color.name}
                className="flex flex-col items-center gap-1"
              >
                <div className="flex gap-1">
                  <div
                    className="flex size-10 items-center justify-center rounded font-medium text-[8px]"
                    style={{
                      backgroundColor: `var(--color-syntax-${color.name}-light)`,
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                    title={`--color-syntax-${color.name}-light`}
                  >
                    L
                  </div>
                  <div
                    className="flex size-10 items-center justify-center rounded font-medium text-[8px]"
                    style={{
                      backgroundColor: `var(--color-syntax-${color.name}-dark)`,
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                    title={`--color-syntax-${color.name}-dark`}
                  >
                    D
                  </div>
                </div>
                <span
                  className="font-medium text-xs"
                  style={{ color: getTextColor() }}
                >
                  {color.label}
                </span>
                <span
                  className="text-[9px]"
                  style={{ color: getTextColor(0.4) }}
                >
                  {color.hue}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Code Syntax Mapping - Hidden by default */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <h3
            className="font-semibold text-sm"
            style={{ color: getTextColor() }}
          >
            Code Syntax Mapping
          </h3>
          <label
            className="flex cursor-pointer items-center gap-2 text-xs"
            style={{ color: getMutedTextColor() }}
          >
            <input
              type="checkbox"
              checked={showCodeSyntaxMapping}
              onChange={(e) => setShowCodeSyntaxMapping(e.target.checked)}
              className="size-4 cursor-pointer rounded accent-primary-500"
            />
            Show
          </label>
          <label
            className="flex cursor-pointer items-center gap-2 text-xs"
            style={{ color: getMutedTextColor() }}
          >
            <input
              type="checkbox"
              checked={showExampleTheme}
              onChange={(e) => setShowExampleTheme(e.target.checked)}
              className="size-4 cursor-pointer rounded accent-primary-500"
            />
            Show example theme
          </label>
        </div>
      </div>

      {showCodeSyntaxMapping && (
        <>
          {/* Code Syntax Colors - Side by side when example theme is enabled */}
          <div
            className={`grid gap-4 ${showExampleTheme ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {/* Our Theme - Base Tokens */}
            <div className="flex flex-col gap-4 rounded-lg bg-background p-6">
              <div>
                <h3 className="font-semibold text-foreground text-sm">
                  {showExampleTheme
                    ? 'Our Theme - Base Tokens'
                    : 'Code Syntax Colors (Base Tokens)'}
                </h3>
                <p className="text-muted-foreground text-xs">
                  Base syntax highlighting tokens used in code blocks.
                </p>
              </div>
              <div className="grid grid-cols-5 gap-4">
                {syntaxTokens.map((token) => (
                  <SyntaxColorCard
                    key={token.name}
                    tokenName={token.name}
                    label={token.label}
                    description={token.description}
                  />
                ))}
              </div>
            </div>

            {/* Example Theme - Base Tokens */}
            {showExampleTheme && (
              <div
                className="flex flex-col gap-4 rounded-lg p-6"
                style={{
                  backgroundColor: 'var(--example-syntax-editor-background)',
                }}
              >
                <div>
                  <h3
                    className="font-semibold text-sm"
                    style={{ color: 'var(--example-syntax-editor-foreground)' }}
                  >
                    Example Theme - Base Tokens
                  </h3>
                  <p
                    className="text-xs"
                    style={{
                      color: 'var(--example-syntax-editor-foreground)',
                      opacity: 0.6,
                    }}
                  >
                    Colors from example-theme-dark.json /
                    example-theme-light.json
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-4">
                  {syntaxTokens.map((token) => (
                    <SyntaxColorCard
                      key={token.name}
                      tokenName={token.name}
                      label={token.label}
                      description={token.description}
                      isExample
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Specific Syntax Token Overrides - Side by side when example theme is enabled */}
          <div
            className={`grid gap-4 ${showExampleTheme ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {/* Our Theme - Specific Tokens */}
            <div className="flex flex-col gap-4 rounded-lg bg-background p-6">
              <div>
                <h3 className="font-semibold text-foreground text-sm">
                  {showExampleTheme
                    ? 'Our Theme - Specific Tokens'
                    : 'Specific Syntax Tokens (Web/Node)'}
                </h3>
                <p className="text-muted-foreground text-xs">
                  Fine-grained overrides for specific scopes (JS, TS, React,
                  CSS, etc.).
                </p>
              </div>

              {/* Group by category */}
              {(
                [
                  'Variables',
                  'Keywords',
                  'Types',
                  'Strings',
                  'Web',
                  'Regex',
                  'Additional',
                ] as const
              ).map((category) => (
                <div key={category} className="flex flex-col gap-2">
                  <h4 className="font-medium text-muted-foreground text-xs">
                    {category}
                  </h4>
                  <div className="grid grid-cols-5 gap-3">
                    {specificSyntaxTokens
                      .filter((t) => t.category === category)
                      .map((token) => (
                        <SyntaxColorCard
                          key={token.name}
                          tokenName={token.name}
                          label={token.label}
                          description={token.description}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Example Theme - Specific Tokens */}
            {showExampleTheme && (
              <div
                className="flex flex-col gap-4 rounded-lg p-6"
                style={{
                  backgroundColor: 'var(--example-syntax-editor-background)',
                }}
              >
                <div>
                  <h3
                    className="font-semibold text-sm"
                    style={{ color: 'var(--example-syntax-editor-foreground)' }}
                  >
                    Example Theme - Specific Tokens
                  </h3>
                  <p
                    className="text-xs"
                    style={{
                      color: 'var(--example-syntax-editor-foreground)',
                      opacity: 0.6,
                    }}
                  >
                    Fine-grained overrides from example theme
                  </p>
                </div>

                {/* Group by category */}
                {[
                  'Variables',
                  'Keywords',
                  'Types',
                  'Strings',
                  'Web',
                  'Regex',
                  'Additional',
                ].map((category) => (
                  <div key={category} className="flex flex-col gap-2">
                    <h4
                      className="font-medium text-xs"
                      style={{
                        color: 'var(--example-syntax-editor-foreground)',
                        opacity: 0.6,
                      }}
                    >
                      {category}
                    </h4>
                    <div className="grid grid-cols-5 gap-3">
                      {specificSyntaxTokens
                        .filter((t) => t.category === category)
                        .map((token) => (
                          <SyntaxColorCard
                            key={token.name}
                            tokenName={token.name}
                            label={token.label}
                            description={token.description}
                            isExample
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bracket Highlight Colors */}
          <div
            className={`grid gap-4 ${showExampleTheme ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {/* Our Theme - Bracket Highlights */}
            <div className="flex flex-col gap-4 rounded-lg bg-background p-6">
              <div>
                <h3 className="font-semibold text-foreground text-sm">
                  {showExampleTheme
                    ? 'Our Theme - Bracket Highlight'
                    : 'Bracket Highlight Colors'}
                </h3>
                <p className="text-muted-foreground text-xs">
                  Colorized bracket pair colors for nesting levels.
                </p>
              </div>
              <div className="flex flex-row gap-3">
                {bracketHighlightTokens.map((token) => (
                  <SyntaxColorCard
                    key={token.name}
                    tokenName={token.name}
                    label={token.label}
                    description={token.description}
                  />
                ))}
              </div>
            </div>

            {/* Example Theme - Bracket Highlights */}
            {showExampleTheme && (
              <div
                className="flex flex-col gap-4 rounded-lg p-6"
                style={{
                  backgroundColor: 'var(--example-syntax-editor-background)',
                }}
              >
                <div>
                  <h3
                    className="font-semibold text-sm"
                    style={{ color: 'var(--example-syntax-editor-foreground)' }}
                  >
                    Example Theme - Bracket Highlight
                  </h3>
                  <p
                    className="text-xs"
                    style={{
                      color: 'var(--example-syntax-editor-foreground)',
                      opacity: 0.6,
                    }}
                  >
                    Colorized bracket pair colors from example theme.
                  </p>
                </div>
                <div className="flex flex-row gap-3">
                  {bracketHighlightTokens.map((token) => (
                    <SyntaxColorCard
                      key={token.name}
                      tokenName={token.name}
                      label={token.label}
                      description={token.description}
                      isExample
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Example Theme Info (when toggled) */}
      {showExampleTheme && (
        <div
          className="flex items-center gap-6 rounded-lg p-4 text-xs"
          style={{ backgroundColor: 'var(--example-syntax-editor-background)' }}
        >
          <span
            className="font-medium"
            style={{ color: 'var(--example-syntax-editor-foreground)' }}
          >
            Example Theme Editor:
          </span>
          <span
            className="flex items-center gap-2"
            style={{ color: 'var(--example-syntax-editor-foreground)' }}
          >
            FG:
            <span
              className="size-4 rounded border"
              style={{
                backgroundColor: 'var(--example-syntax-editor-foreground)',
                borderColor: 'rgba(128,128,128,0.3)',
              }}
            />
          </span>
          <span
            className="flex items-center gap-2"
            style={{ color: 'var(--example-syntax-editor-foreground)' }}
          >
            BG:
            <span
              className="size-4 rounded border"
              style={{
                backgroundColor: 'var(--example-syntax-editor-background)',
                borderColor: 'var(--example-syntax-editor-foreground)',
              }}
            />
          </span>
          <span
            className="opacity-60"
            style={{ color: 'var(--example-syntax-editor-foreground)' }}
          >
            Run <code className="font-mono">pnpm generate:example-theme</code>{' '}
            to update
          </span>
        </div>
      )}
    </div>
  );
};

const meta = {
  title: 'Example/Colors',
  component: ColorShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ColorShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ColorShowcase />,
};
